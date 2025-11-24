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
    port: 8883,
    topic: 'carro/datos',
    clientId: `DashboardCarro_${Math.floor(Math.random() * 10000)}`,
    useSSL: true,
    userName: 'hivemq.webclient.1763947373881', // Configura tu usuario aquí
    password: 'RFsB<l>yO29c#gP1J0@r' // Configura tu contraseña aquí
  };

  private isInitialized = false;

  constructor() {
    // Esperar a que Paho esté disponible antes de inicializar
    this.waitForPaho();
  }

  private waitForPaho(): void {
    if (typeof (window as any).Paho !== 'undefined') {
      this.initializeClient();
      this.isInitialized = true;
    } else {
      // Reintentar después de 100ms
      setTimeout(() => this.waitForPaho(), 100);
    }
  }

  private initializeClient(): void {
    if (typeof (window as any).Paho === 'undefined') {
      console.error('Paho MQTT no está disponible');
      return;
    }

    const Paho = (window as any).Paho;
    this.client = new Paho.MQTT.Client(
      this.config.host,
      Number(this.config.port),
      this.config.clientId
    );

    this.client.onConnectionLost = (responseObject: any) => {
      console.log('Conexión perdida:', responseObject.errorMessage);
      this.isConnected.set(false);
      this.connectionStatusSubject.next(false);
      setTimeout(() => this.connect(), 2000);
    };

    this.client.onMessageArrived = (message: any) => {
      const payload = message.payloadString;
      console.log('Mensaje recibido:', payload);
      
      this.updateLastMessageTime();
      this.lastJsonMessage.set(payload);
      
      try {
        const data: CarroData = JSON.parse(payload);
        this.messageSubject.next(data);
      } catch (err) {
        console.error('Error al parsear JSON:', err);
      }
    };
  }

  public connect(): void {
    if (!this.isInitialized) {
      this.waitForPaho();
      setTimeout(() => this.connect(), 200);
      return;
    }

    if (this.client) {
      const connectOptions: any = {
        timeout: 10,
        useSSL: this.config.useSSL ?? false,
        onSuccess: () => {
          console.log('MQTT conectado');
          this.isConnected.set(true);
          this.connectionStatusSubject.next(true);
          
          this.client.subscribe(this.config.topic, {
            qos: 0,
            onSuccess: () => {
              console.log('Suscrito a:', this.config.topic);
            },
            onFailure: (err: any) => {
              console.error('Error al suscribirse:', err);
            }
          });
        },
        onFailure: (err: any) => {
          console.error('Error al conectar MQTT:', err);
          this.isConnected.set(false);
          this.connectionStatusSubject.next(false);
          setTimeout(() => this.connect(), 2000);
        }
      };

      // Agregar credenciales si están configuradas
      if (this.config.userName) {
        connectOptions.userName = this.config.userName;
      }
      if (this.config.password) {
        connectOptions.password = this.config.password;
      }

      this.client.connect(connectOptions);
    }
  }

  public disconnect(): void {
    if (this.client && this.client.isConnected()) {
      this.client.disconnect();
      this.isConnected.set(false);
      this.connectionStatusSubject.next(false);
    }
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
}

