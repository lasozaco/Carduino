import { Injectable, signal } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { CarroData, MqttConfig } from '../models/carro-data.interface';

declare const Paho: any;

@Injectable({
  providedIn: 'root'
})
export class MqttService {
  private client: any;
  private messageSubject = new Subject<CarroData>();
  private connectionStatusSubject = new Subject<boolean>();
  private lastJsonMessage = signal<string>('{}');
  
  public readonly isConnected = signal<boolean>(false);
  public readonly lastMessageTime = signal<string>('–');
  
  public readonly messages$: Observable<CarroData> = this.messageSubject.asObservable();
  public readonly connectionStatus$: Observable<boolean> = this.connectionStatusSubject.asObservable();

  private config: MqttConfig = {
    host: 'adca0ce03c0645f1861420dc3732838e.s1.eu.hivemq.cloud',
    port: 8884, // Puerto correcto para WebSockets SSL en HiveMQ Cloud
    topic: 'carro/datos',
    clientId: `DashboardCarro_${Math.floor(Math.random() * 10000)}`,
    useSSL: true,
    userName: 'adminsub', // Usuario de solo lectura
    password: '@NalaSeisMax04' // Contraseña de solo lectura
  };

  private isInitialized = false;
  private isWaitingForPaho = false; // Prevenir múltiples llamadas simultáneas
  private connectionCheckInterval?: any;
  private reconnectTimeout?: any;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 3000; // 3 segundos
  private readonly CONNECTION_CHECK_INTERVAL = 5000; // Verificar cada 5 segundos
  private lastMessageReceived = 0;
  private readonly MESSAGE_TIMEOUT = 15000; // 15 segundos sin mensajes = posible desconexión

  constructor() {
    // Esperar un momento para que el DOM y los scripts estén listos
    setTimeout(() => {
      this.waitForPaho();
      this.startConnectionMonitoring();
    }, 100);
  }

  private waitForPaho(): void {
    // Prevenir múltiples llamadas simultáneas
    if (this.isWaitingForPaho) {
      console.log('⏳ Ya hay una verificación de Paho en curso, esperando...');
      return;
    }
    
    if (this.isInitialized) {
      console.log('✅ Paho ya está inicializado');
      return;
    }
    
    this.isWaitingForPaho = true;
    console.log('🔍 Verificando disponibilidad de Paho MQTT...');
    console.log('window.Paho:', typeof (window as any).Paho);
    console.log('window.Paho.MQTT:', typeof (window as any).Paho?.MQTT);
    console.log('window.Paho.Client:', typeof (window as any).Paho?.Client);
    console.log('Paho completo:', (window as any).Paho);
    
    // Verificar diferentes estructuras de Paho
    const Paho = (window as any).Paho;
    let pahoAvailable = false;
    
    if (typeof Paho !== 'undefined') {
      // Verificar si es la estructura antigua (mqttws31.min.js)
      if (typeof Paho.MQTT !== 'undefined' && typeof Paho.MQTT.Client !== 'undefined') {
        pahoAvailable = true;
        console.log('✅ Paho MQTT encontrado (estructura antigua: Paho.MQTT.Client)');
      }
      // Verificar si es la estructura nueva (paho-mqtt.min.js)
      else if (typeof Paho.Client !== 'undefined') {
        pahoAvailable = true;
        console.log('✅ Paho MQTT encontrado (estructura nueva: Paho.Client)');
      }
    }
    
    // Verificar inmediatamente
    if (pahoAvailable) {
      console.log('✅ Paho MQTT ya está disponible');
      this.isWaitingForPaho = false;
      this.initializeClient();
      this.isInitialized = true;
      return;
    }
    
    // Reintentar después de 200ms, máximo 50 intentos (10 segundos)
    const maxAttempts = 50;
    let attempts = 0;
    const checkPaho = () => {
      attempts++;
      
      // Solo mostrar cada 5 intentos para no saturar la consola
      if (attempts % 5 === 0 || attempts === 1) {
        console.log(`⏳ Esperando Paho MQTT... (Intento ${attempts}/${maxAttempts})`);
      }
      
      const Paho = (window as any).Paho;
      let pahoAvailable = false;
      
      if (typeof Paho !== 'undefined') {
        // Verificar estructura antigua
        if (typeof Paho.MQTT !== 'undefined' && typeof Paho.MQTT.Client !== 'undefined') {
          pahoAvailable = true;
        }
        // Verificar estructura nueva
        else if (typeof Paho.Client !== 'undefined') {
          pahoAvailable = true;
        }
      }
      
      if (pahoAvailable) {
        console.log('✅ Paho MQTT cargado correctamente en intento', attempts);
        this.isWaitingForPaho = false;
        this.initializeClient();
        this.isInitialized = true;
      } else if (attempts < maxAttempts) {
        setTimeout(checkPaho, 200);
      } else {
        console.error('❌ Paho MQTT no se pudo cargar después de 10 segundos');
        console.error('Verifica que el script esté incluido en index.html');
        console.error('Estado actual:');
        console.error('  - window.Paho:', typeof (window as any).Paho);
        console.error('  - Scripts en head:', Array.from(document.head.querySelectorAll('script')).map(s => s.src || s.textContent?.substring(0, 50)));
        
        this.isWaitingForPaho = false;
        // Intentar cargar manualmente como último recurso
        this.loadPahoManually();
      }
    };
    setTimeout(checkPaho, 200);
  }

  private loadPahoManually(): void {
    console.log('🔄 Intentando cargar Paho MQTT manualmente...');
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/paho-mqtt@1.1.0/mqttws31.min.js';
    script.onload = () => {
      console.log('✅ Script cargado manualmente, verificando...');
      setTimeout(() => {
        if (typeof (window as any).Paho !== 'undefined') {
          console.log('✅ Paho MQTT ahora disponible');
          this.initializeClient();
          this.isInitialized = true;
        } else {
          console.error('❌ Paho MQTT aún no disponible después de cargar manualmente');
        }
      }, 500);
    };
    script.onerror = () => {
      console.error('❌ Error al cargar Paho MQTT manualmente');
    };
    document.head.appendChild(script);
  }

  private initializeClient(): void {
    console.log('🔧 Inicializando cliente MQTT...');
    
    const Paho = (window as any).Paho;
    if (typeof Paho === 'undefined') {
      console.error('❌ Paho MQTT no está disponible en window.Paho');
      return;
    }

    // Determinar qué estructura de Paho está disponible
    let ClientConstructor: any = null;
    
    if (typeof Paho.MQTT !== 'undefined' && typeof Paho.MQTT.Client !== 'undefined') {
      // Estructura antigua: Paho.MQTT.Client
      ClientConstructor = Paho.MQTT.Client;
      console.log('✅ Usando estructura antigua: Paho.MQTT.Client');
    } else if (typeof Paho.Client !== 'undefined') {
      // Estructura nueva: Paho.Client
      ClientConstructor = Paho.Client;
      console.log('✅ Usando estructura nueva: Paho.Client');
    } else {
      console.error('❌ No se pudo encontrar Paho.Client o Paho.MQTT.Client');
      console.error('Paho disponible:', Paho);
      return;
    }

    console.log('✅ Paho MQTT disponible, creando cliente...');
    console.log('  Host:', this.config.host);
    console.log('  Port:', this.config.port);
    console.log('  Client ID:', this.config.clientId);
    
    try {
      this.client = new ClientConstructor(
        this.config.host,
        Number(this.config.port),
        this.config.clientId
      );
      console.log('✅ Cliente MQTT creado exitosamente');
    } catch (error) {
      console.error('❌ Error al crear cliente MQTT:', error);
      return;
    }

    this.client.onConnectionLost = (responseObject: any) => {
      console.error('❌ Conexión MQTT perdida:', responseObject.errorMessage);
      console.error('Código de error:', responseObject.errorCode);
      this.isConnected.set(false);
      this.connectionStatusSubject.next(false);
      this.scheduleReconnect();
    };

    this.client.onMessageArrived = (message: any) => {
      const payload = message.payloadString;
      const topic = message.destinationName;
      console.log('📨 Mensaje MQTT recibido:');
      console.log('  Topic:', topic);
      console.log('  Payload:', payload);
      console.log('  Longitud:', payload.length, 'caracteres');
      
      // Actualizar timestamp del último mensaje recibido
      this.lastMessageReceived = Date.now();
      
      this.updateLastMessageTime();
      this.lastJsonMessage.set(payload);
      
      try {
        const data: CarroData = JSON.parse(payload);
        console.log('✅ JSON parseado correctamente:', data);
        
        // Verificar el estado de conexión reportado por el ESP32
        if (data.mqtt_connected !== undefined) {
          if (data.mqtt_connected && !this.isConnected()) {
            console.log('✅ ESP32 reporta conexión MQTT establecida');
            this.isConnected.set(true);
            this.connectionStatusSubject.next(true);
          } else if (!data.mqtt_connected && this.isConnected()) {
            console.warn('⚠️ ESP32 reporta desconexión MQTT');
            // No cambiar el estado aquí, dejar que el monitoreo lo detecte
          }
        }
        
        this.messageSubject.next(data);
      } catch (err) {
        console.error('❌ Error al parsear JSON:', err);
        console.error('Payload que falló:', payload);
      }
    };
  }

  public connect(): void {
    if (!this.isInitialized) {
      console.log('⏳ Esperando inicialización de Paho MQTT...');
      this.waitForPaho();
      setTimeout(() => this.connect(), 500);
      return;
    }

    if (!this.client) {
      console.error('❌ Cliente MQTT no inicializado');
      this.waitForPaho();
      setTimeout(() => this.connect(), 500);
      return;
    }

    // Si ya está conectado, verificar suscripción
    if (this.client.isConnected()) {
      console.log('✅ Ya conectado a MQTT');
      console.log('🔍 Verificando suscripción al topic:', this.config.topic);
      this.isConnected.set(true);
      this.connectionStatusSubject.next(true);
      this.reconnectAttempts = 0; // Resetear contador
      
      // Asegurar que está suscrito
      this.client.subscribe(this.config.topic, {
        qos: 0,
        onSuccess: () => {
          console.log('✅ Re-suscrito a:', this.config.topic);
        },
        onFailure: (err: any) => {
          console.error('❌ Error al re-suscribirse:', err);
        }
      });
      return;
    }

    console.log(`🔄 Intentando conectar a MQTT (Intento ${this.reconnectAttempts + 1}/${this.MAX_RECONNECT_ATTEMPTS})...`);
    console.log(`📍 Broker: ${this.config.host}:${this.config.port}`);
    console.log(`📡 Topic: ${this.config.topic}`);
    console.log(`👤 Usuario: ${this.config.userName}`);
    console.log(`🔐 SSL: ${this.config.useSSL ? 'Sí' : 'No'}`);
    
    const connectOptions: any = {
      timeout: 10,
      useSSL: this.config.useSSL ?? false,
      onSuccess: () => {
        console.log('✅ MQTT conectado exitosamente');
        this.isConnected.set(true);
        this.connectionStatusSubject.next(true);
        this.reconnectAttempts = 0; // Resetear contador en éxito
        this.lastMessageReceived = Date.now(); // Resetear timeout
        
        console.log(`📡 Intentando suscribirse al topic: "${this.config.topic}"`);
        this.client.subscribe(this.config.topic, {
          qos: 0,
          onSuccess: () => {
            console.log('✅ Suscrito exitosamente a:', this.config.topic);
            console.log('⏳ Esperando mensajes...');
          },
          onFailure: (err: any) => {
            console.error('❌ Error al suscribirse al topic:', this.config.topic);
            console.error('Error completo:', err);
            console.error('Mensaje:', err.errorMessage || err.message || 'Sin mensaje');
            console.error('Código:', err.errorCode || 'Sin código');
            console.error('Detalles del error:', JSON.stringify(err, null, 2));
          }
        });
      },
      onFailure: (err: any) => {
        this.reconnectAttempts++;
        console.error('❌ Error al conectar MQTT');
        console.error('Error completo:', err);
        console.error('Mensaje:', err.errorMessage || err.message || 'Sin mensaje');
        console.error('Código:', err.errorCode || 'Sin código');
        this.isConnected.set(false);
        this.connectionStatusSubject.next(false);
        
        if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
          console.log(`🔄 Reintentando en ${this.RECONNECT_DELAY}ms...`);
          this.scheduleReconnect();
        } else {
          console.error(`⚠️ Máximo de intentos (${this.MAX_RECONNECT_ATTEMPTS}) alcanzado. Deteniendo reintentos automáticos.`);
          this.reconnectAttempts = 0; // Resetear para permitir reintentos manuales
        }
      }
    };

    // Agregar credenciales si están configuradas
    if (this.config.userName) {
      connectOptions.userName = this.config.userName;
    }
    if (this.config.password) {
      connectOptions.password = this.config.password;
    }

    try {
      this.client.connect(connectOptions);
    } catch (error) {
      console.error('❌ Excepción al intentar conectar:', error);
      this.isConnected.set(false);
      this.connectionStatusSubject.next(false);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.RECONNECT_DELAY);
  }

  private startConnectionMonitoring(): void {
    // Verificar conexión periódicamente
    this.connectionCheckInterval = setInterval(() => {
      if (this.client && this.isInitialized) {
        const wasConnected = this.isConnected();
        const isCurrentlyConnected = this.client.isConnected();
        
        // Verificar timeout de mensajes (si está conectado pero no recibe mensajes)
        const timeSinceLastMessage = Date.now() - this.lastMessageReceived;
        const hasMessageTimeout = this.lastMessageReceived > 0 && timeSinceLastMessage > this.MESSAGE_TIMEOUT;
        
        if (hasMessageTimeout && isCurrentlyConnected) {
          console.warn(`⚠️ Timeout de mensajes: ${Math.round(timeSinceLastMessage / 1000)}s sin recibir datos`);
          console.warn('⚠️ Posible problema de conexión MQTT - reconectando...');
          this.isConnected.set(false);
          this.connectionStatusSubject.next(false);
          this.scheduleReconnect();
          return;
        }
        
        if (wasConnected !== isCurrentlyConnected) {
          console.log(`🔄 Estado de conexión cambió: ${wasConnected ? 'conectado' : 'desconectado'} -> ${isCurrentlyConnected ? 'conectado' : 'desconectado'}`);
          this.isConnected.set(isCurrentlyConnected);
          this.connectionStatusSubject.next(isCurrentlyConnected);
          
          if (!isCurrentlyConnected && this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
            console.log('🔄 Intentando reconectar...');
            this.scheduleReconnect();
          }
        }
      }
    }, this.CONNECTION_CHECK_INTERVAL);
  }

  public disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
    
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = undefined;
    }
    
    if (this.client && this.client.isConnected()) {
      this.client.disconnect();
      console.log('🔌 Desconectado de MQTT');
    }
    
    this.isConnected.set(false);
    this.connectionStatusSubject.next(false);
    this.reconnectAttempts = 0;
  }

  public updateConfig(config: Partial<MqttConfig>): void {
    this.config = { ...this.config, ...config };
    this.disconnect();
    
    if (typeof (window as any).Paho !== 'undefined') {
      this.initializeClient();
      this.connect();
    } else {
      this.waitForPaho();
    }
  }

  public getConfig(): MqttConfig {
    return { ...this.config };
  }

  private updateLastMessageTime(): void {
    const now = new Date();
    this.lastMessageTime.set(now.toLocaleTimeString());
  }

  public getLastJsonMessage(): string {
    return this.lastJsonMessage();
  }

  public getConnectionStatus(): { connected: boolean; attempts: number; maxAttempts: number } {
    return {
      connected: this.isConnected(),
      attempts: this.reconnectAttempts,
      maxAttempts: this.MAX_RECONNECT_ATTEMPTS
    };
  }

  public forceReconnect(): void {
    console.log('🔄 Forzando reconexión MQTT...');
    this.reconnectAttempts = 0; // Resetear contador
    this.disconnect();
    setTimeout(() => this.connect(), 1000);
  }

  public getDiagnosticInfo(): any {
    return {
      isInitialized: this.isInitialized,
      clientExists: !!this.client,
      isConnected: this.client ? this.client.isConnected() : false,
      config: { ...this.config },
      reconnectAttempts: this.reconnectAttempts,
      lastMessageReceived: this.lastMessageReceived > 0 ? new Date(this.lastMessageReceived).toLocaleString() : 'Nunca',
      timeSinceLastMessage: this.lastMessageReceived > 0 ? Math.round((Date.now() - this.lastMessageReceived) / 1000) + 's' : 'N/A'
    };
  }
}


