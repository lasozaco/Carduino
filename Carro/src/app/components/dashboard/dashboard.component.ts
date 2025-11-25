import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MqttService } from '../../services/mqtt.service';
import { CarroData } from '../../models/carro-data.interface';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly mqttService = inject(MqttService);
  
  private messageSubscription?: Subscription;
  private connectionSubscription?: Subscription;

  // Datos del carro
  public readonly distancia = signal<number | null>(null);
  public readonly objetos = signal<number | null>(null);
  public readonly velocidad = signal<number | null>(null);
  public readonly velocidadLabel = signal<string>('–');
  public readonly lastJsonMessage = signal<string>('{}');

  // Estado de conexión
  public readonly isWifiConnected = signal<boolean>(true);
  public readonly isMqttConnected = signal<boolean>(false);
  public readonly mqttStatusText = signal<string>('Desconectado');
  public readonly mqttStatusClass = signal<string>('disconnected');
  public readonly lastUpdate = signal<string>('–');
  public readonly connectionStatus = signal<{ connected: boolean; attempts: number; maxAttempts: number }>({
    connected: false,
    attempts: 0,
    maxAttempts: 5
  });
  public readonly esp32MqttStatus = signal<boolean | null>(null);
  public readonly esp32WifiStatus = signal<boolean | null>(null);
  public readonly esp32WifiRssi = signal<number | null>(null);

  // Configuración
  public readonly config = signal(this.mqttService.getConfig());
  
  // UI State
  public activeTab: 'config' | 'json' = 'config';

  ngOnInit(): void {
    this.isWifiConnected.set(true);
    
    this.messageSubscription = this.mqttService.messages$.subscribe((data: CarroData) => {
      this.updateData(data);
    });

    this.connectionSubscription = this.mqttService.connectionStatus$.subscribe((connected: boolean) => {
      this.isMqttConnected.set(connected);
      this.updateMqttStatus(connected);
      this.connectionStatus.set(this.mqttService.getConnectionStatus());
    });
    
    // Actualizar estado de conexión periódicamente
    setInterval(() => {
      const status = this.mqttService.getConnectionStatus();
      this.connectionStatus.set(status);
      this.updateMqttStatus(status.connected);
    }, 2000);

    this.lastUpdate.set(this.mqttService.lastMessageTime());

    this.mqttService.connect();
  }

  ngOnDestroy(): void {
    this.messageSubscription?.unsubscribe();
    this.connectionSubscription?.unsubscribe();
    this.mqttService.disconnect();
  }

  private updateData(data: CarroData): void {
    if (data.dist_cm !== undefined) {
      this.distancia.set(data.dist_cm);
    }

    if (data.objetos !== undefined) {
      this.objetos.set(data.objetos);
    }

    if (data.vel_pct !== undefined) {
      this.velocidad.set(data.vel_pct);
      const label = data.vel_pct >= 80 ? 'Rápida' : 'Lenta/Media';
      this.velocidadLabel.set(label);
    }

    // Actualizar estado de conexión reportado por ESP32
    if (data.mqtt_connected !== undefined) {
      this.esp32MqttStatus.set(data.mqtt_connected);
    }
    
    if (data.wifi_connected !== undefined) {
      this.esp32WifiStatus.set(data.wifi_connected);
    }
    
    if (data.wifi_rssi !== undefined) {
      this.esp32WifiRssi.set(data.wifi_rssi);
    }

    // Actualizar timestamp del último mensaje
    this.lastUpdate.set(this.mqttService.lastMessageTime());

    // Guardar el último mensaje JSON (solo cuando llega un nuevo mensaje)
    this.lastJsonMessage.set(JSON.stringify(data, null, 2));
  }

  public formatValue(value: number | null, decimals: number = 2): string {
    return value !== null ? value.toFixed(decimals) : '–';
  }

  public formatInteger(value: number | null): string {
    return value !== null ? value.toString() : '–';
  }

  public getDistanciaPercent(): number {
    const dist = this.distancia();
    if (dist === null) return 0;
    return Math.min((dist / 200) * 100, 100);
  }

  public getVelocidadPercent(): number {
    return this.velocidad() || 0;
  }

  private updateMqttStatus(connected: boolean): void {
    if (connected) {
      this.mqttStatusText.set('Conectado');
      this.mqttStatusClass.set('connected');
    } else {
      const status = this.connectionStatus();
      if (status.attempts > 0 && status.attempts < status.maxAttempts) {
        this.mqttStatusText.set(`Reconectando (${status.attempts}/${status.maxAttempts})...`);
        this.mqttStatusClass.set('reconnecting');
      } else {
        this.mqttStatusText.set('Desconectado');
        this.mqttStatusClass.set('disconnected');
      }
    }
  }

  public reconnectMqtt(): void {
    this.mqttService.forceReconnect();
  }

  public showDiagnostics(): void {
    const diag = this.mqttService.getDiagnosticInfo();
    console.log('🔍 DIAGNÓSTICO MQTT:');
    console.log('==================');
    console.log('Inicializado:', diag.isInitialized);
    console.log('Cliente existe:', diag.clientExists);
    console.log('Conectado:', diag.isConnected);
    console.log('Configuración:', diag.config);
    console.log('Intentos de reconexión:', diag.reconnectAttempts);
    console.log('Último mensaje recibido:', diag.lastMessageReceived);
    console.log('Tiempo desde último mensaje:', diag.timeSinceLastMessage);
    console.log('==================');
    alert(`DIAGNÓSTICO MQTT:\n\n` +
          `Inicializado: ${diag.isInitialized}\n` +
          `Cliente existe: ${diag.clientExists}\n` +
          `Conectado: ${diag.isConnected}\n` +
          `Topic: ${diag.config.topic}\n` +
          `Broker: ${diag.config.host}:${diag.config.port}\n` +
          `Intentos: ${diag.reconnectAttempts}\n` +
          `Último mensaje: ${diag.lastMessageReceived}\n` +
          `Tiempo desde último: ${diag.timeSinceLastMessage}\n\n` +
          `Revisa la consola del navegador (F12) para más detalles.`);
  }

  public copyJson(): void {
    const jsonText = this.lastJsonMessage();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(jsonText).then(() => {
        // Feedback visual opcional
        const btn = document.querySelector('.copy-btn');
        if (btn) {
          const originalText = btn.textContent;
          btn.textContent = '✅ Copiado!';
          setTimeout(() => {
            btn.textContent = originalText;
          }, 2000);
        }
      }).catch(err => {
        console.error('Error al copiar:', err);
        this.fallbackCopyText(jsonText);
      });
    } else {
      this.fallbackCopyText(jsonText);
    }
  }

  private fallbackCopyText(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      const btn = document.querySelector('.copy-btn');
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = '✅ Copiado!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      }
    } catch (err) {
      console.error('Error al copiar (fallback):', err);
    }
    document.body.removeChild(textArea);
  }
}

