#!/usr/bin/env python3
"""
BEWIS AS400 Vibration Sensor Gateway for FioTec
Reads 3-axis MEMS accelerometer data from RS485 port 1 (/dev/tty485_1)
and uploads telemetry to FioTec Supabase via webhook.

Device: BEWIS AS400-1 (3-axis accelerometer with PPV monitoring)
Sensor output: 18-field CSV stream at 6.7 Hz (150ms per frame)
"""

import serial
import json
import time
import logging
import sys
import os
from datetime import datetime
from logging.handlers import RotatingFileHandler

# Configuration
SERIAL_PORT = '/dev/tty485_1'
BAUD_RATE = 9600
DEVICE_ID = 'AS400-001'
BATCH_SIZE = 10
BATCH_INTERVAL = 5

# Load secrets
secrets_path = '/opt/.secrets'
WEBHOOK_TOKEN = None
FIOTECH_URL = None
ANON_KEY = None

if os.path.exists(secrets_path):
    with open(secrets_path, 'r') as f:
        for line in f:
            if line.startswith('WEBHOOK_TOKEN='):
                WEBHOOK_TOKEN = line.split('=', 1)[1].strip()
            elif line.startswith('FIOTECH_URL='):
                FIOTECH_URL = line.split('=', 1)[1].strip()
            elif line.startswith('ANON_KEY='):
                ANON_KEY = line.split('=', 1)[1].strip()

# Setup logging
log_file = '/var/log/as400_gateway.log'
handler = RotatingFileHandler(log_file, maxBytes=10*1024*1024, backupCount=3)
formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s')
handler.setFormatter(formatter)

logger = logging.getLogger('as400_gateway')
logger.addHandler(handler)
logger.setLevel(logging.INFO)

class AS400Gateway:
    def __init__(self):
        self.ser = None
        self.batch = []
        self.last_batch_time = time.time()
        self.frame_count = 0
        self.error_count = 0
        
    def connect(self):
        """Open serial connection to AS400"""
        try:
            self.ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2)
            logger.info(f'Connected to {SERIAL_PORT} at {BAUD_RATE} baud')
            return True
        except Exception as e:
            logger.error(f'Failed to open {SERIAL_PORT}: {e}')
            return False
    
    def parse_frame(self, line):
        """
        Parse AS400 CSV frame.
        Format: 18 fields including X/Y/Z acceleration, temperature, extended metrics
        Returns dict or None
        """
        try:
            parts = line.strip().split(',')
            if len(parts) < 18:
                return None
            
            # Extract key fields (indices based on AS400 protocol)
            # Field 1-3: X, Y, Z acceleration (m/s²)
            # Field 4: Temperature (°C)
            # Fields 5+: Extended metrics (velocity, displacement, etc)
            
            return {
                'device_id': DEVICE_ID,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'accel_x_g': float(parts[0]) / 9.81,  # Convert m/s² to g
                'accel_y_g': float(parts[1]) / 9.81,
                'accel_z_g': float(parts[2]) / 9.81,
                'temperature_c': float(parts[3]),
                'velocity_x': float(parts[4]) if len(parts) > 4 else 0,
                'velocity_y': float(parts[5]) if len(parts) > 5 else 0,
                'velocity_z': float(parts[6]) if len(parts) > 6 else 0,
                'raw': line[:100]  # Store first 100 chars of raw frame
            }
        except (ValueError, IndexError) as e:
            logger.warning(f'Parse error: {e}, frame: {line[:50]}')
            self.error_count += 1
            return None
    
    def upload_batch(self):
        """Upload batch of readings to FioTec webhook"""
        if not self.batch:
            return
        
        try:
            import urllib.request
            import urllib.error
            
            payload = json.dumps(self.batch).encode('utf-8')
            req = urllib.request.Request(
                f'{FIOTECH_URL}/webhooks/vibration',
                data=payload,
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {WEBHOOK_TOKEN}',
                    'User-Agent': 'FioTec-AS400/1.0'
                }
            )
            
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    logger.info(f'Uploaded {len(self.batch)} readings')
                else:
                    logger.warning(f'Upload returned {response.status}')
            
            self.batch = []
            self.last_batch_time = time.time()
        except urllib.error.HTTPError as e:
            logger.error(f'Upload failed: HTTP {e.code}')
        except Exception as e:
            logger.error(f'Upload error: {e}')
    
    def run(self):
        """Main gateway loop"""
        if not self.connect():
            return
        
        logger.info(f'Starting AS400 gateway, device_id={DEVICE_ID}')
        
        try:
            while True:
                try:
                    # Read from serial
                    if self.ser.in_waiting:
                        line = self.ser.readline().decode('utf-8', errors='ignore')
                        
                        if line.strip():
                            frame = self.parse_frame(line)
                            if frame:
                                self.batch.append(frame)
                                self.frame_count += 1
                    
                    # Upload batch if full or timeout
                    current_time = time.time()
                    if (len(self.batch) >= BATCH_SIZE or 
                        (self.batch and current_time - self.last_batch_time > BATCH_INTERVAL)):
                        self.upload_batch()
                    
                    time.sleep(0.01)  # Prevent busy loop
                    
                except KeyboardInterrupt:
                    break
                except Exception as e:
                    logger.error(f'Runtime error: {e}')
                    time.sleep(1)
        
        finally:
            if self.ser:
                self.ser.close()
            logger.info(f'Gateway stopped. Frames: {self.frame_count}, Errors: {self.error_count}')

if __name__ == '__main__':
    gateway = AS400Gateway()
    gateway.run()
