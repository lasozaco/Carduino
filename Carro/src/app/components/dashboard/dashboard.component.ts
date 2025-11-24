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
  public readonly temperatura = signal<number | null>(null);
  public readonly accelX = signal<number | null>(null);
  public readonly accelY = signal<number | null>(null);
  public readonly accelZ = signal<number | null>(null);
  public readonly gyroX = signal<number | null>(null);
  public readonly gyroY = signal<number | null>(null);
  public readonly gyroZ = signal<number | null>(null);
  public readonly lastJsonMessage = signal<string>('{}');

  // Estado de conexión
  public readonly isWifiConnected = signal<boolean>(true);
  public readonly isMqttConnected = signal<boolean>(false);
  public readonly mqttStatusText = signal<string>('Desconectado');
  public readonly lastUpdate = signal<string>('–');

  // Configuración
  public readonly config = signal(this.mqttService.getConfig());

  ngOnInit(): void {
    this.isWifiConnected.set(true);
    
    this.messageSubscription = this.mqttService.messages$.subscribe((data: CarroData) => {
      this.updateData(data);
    });

    this.connectionSubscription = this.mqttService.connectionStatus$.subscribe((connected: boolean) => {
      this.isMqttConnected.set(connected);
      this.mqttStatusText.set(connected ? 'Conectado' : 'Desconectado');
    });

    this.lastUpdate.set(this.mqttService.lastMessageTime());
    
    // Observar cambios en lastMessageTime y lastJsonMessage
    setInterval(() => {
      this.lastUpdate.set(this.mqttService.lastMessageTime());
      this.lastJsonMessage.set(this.mqttService.getLastJsonMessage());
    }, 1000);

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

    if (data.accel) {
      if (data.accel.x !== undefined) this.accelX.set(data.accel.x);
      if (data.accel.y !== undefined) this.accelY.set(data.accel.y);
      if (data.accel.z !== undefined) this.accelZ.set(data.accel.z);
    }

    if (data.gyro) {
      if (data.gyro.x !== undefined) this.gyroX.set(data.gyro.x);
      if (data.gyro.y !== undefined) this.gyroY.set(data.gyro.y);
      if (data.gyro.z !== undefined) this.gyroZ.set(data.gyro.z);
    }

    if (data.temp_c !== undefined) {
      this.temperatura.set(data.temp_c);
    }

    // Guardar el último mensaje JSON
    this.lastJsonMessage.set(JSON.stringify(data, null, 2));
  }

  public formatValue(value: number | null, decimals: number = 2): string {
    return value !== null ? value.toFixed(decimals) : '–';
  }

  public formatInteger(value: number | null): string {
    return value !== null ? value.toString() : '–';
  }
}

