export interface AccelData {
  x: number;
  y: number;
  z: number;
}

export interface GyroData {
  x: number;
  y: number;
  z: number;
}

export interface CarroData {
  dist_cm?: number;
  objetos?: number;
  vel_pct?: number;
  temp_c?: number;
  accel?: AccelData;
  gyro?: GyroData;
  mqtt_connected?: boolean;
  wifi_rssi?: number;
  wifi_connected?: boolean;
}

export interface MqttConfig {
  host: string;
  port: number;
  topic: string;
  clientId: string;
  useSSL?: boolean;
  userName?: string;
  password?: string;
}

