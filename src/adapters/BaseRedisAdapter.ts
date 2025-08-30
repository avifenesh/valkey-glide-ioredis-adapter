/**
 * BaseRedisAdapter - Core functionality and connection management
 * ioredis-compatible client built on valkey-glide
 */

import { GlideClient, GlideClientConfiguration } from '@valkey/valkey-glide';
import { EventEmitter } from 'events';
import {
  RedisOptions,
} from '../types';
import { createRobustGlideClient, validateStandaloneConnection } from '../utils/ConnectionUtils';
import { ParameterTranslator } from '../utils/ParameterTranslator';
import { asyncClose } from '../utils/GlideUtils';

export abstract class BaseRedisAdapter extends EventEmitter {
  protected glideClient: GlideClient | null = null;
  protected subscriberClient: GlideClient | null = null;
  protected connectionStatus: string = 'disconnected';
  protected options: RedisOptions;
  protected watchedKeys: Set<string> = new Set();
  protected clientType?: 'client' | 'subscriber' | 'bclient';
  protected enableBlockingOps?: boolean;

  constructor(options: RedisOptions = {}) {
    super();
    this.options = {
      host: 'localhost',
      port: 6379,
      ...options,
    };
  }

  // Connection management
  async connect(): Promise<void> {
    if (this.connectionStatus === 'connected') {
      return;
    }

    this.connectionStatus = 'connecting';
    this.emit('connecting');

    try {
      // Use robust connection utility to prevent cluster issues
      this.glideClient = await createRobustGlideClient(
        this.options,
        'main-adapter',
        { retryAttempts: 3, retryDelay: 1000, connectionTimeout: 5000 }
      );
      
      // Validate the connection is really to a standalone server
      await validateStandaloneConnection(this.glideClient, 'Main Redis Adapter');
      
      this.connectionStatus = 'connected';
      this.emit('connect');
      this.emit('ready');
    } catch (error) {
      this.connectionStatus = 'disconnected';
      this.emit('error', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.glideClient) {
      await asyncClose(this.glideClient, 'Base client disconnect');
      this.glideClient = null;
    }
    if (this.subscriberClient) {
      await asyncClose(this.subscriberClient, 'Base subscriber disconnect');
      this.subscriberClient = null;
    }
    this.connectionStatus = 'disconnected';
    this.emit('end');
  }

  // Bull v3 compatibility - alias for disconnect()
  async quit(): Promise<void> {
    await this.disconnect();
  }

  async ping(message?: string): Promise<string> {
    const client = await this.ensureConnected();
    const options = message ? { message } : undefined;
    const result = await client.ping(options);
    return ParameterTranslator.convertGlideString(result) || 'PONG';
  }

  async info(section?: string): Promise<string> {
    const client = await this.ensureConnected();
    const sections = section ? [section as any] : undefined;
    return await client.info(sections);
  }

  // Generic command execution
  async sendCommand(command: any): Promise<any> {
    const client = await this.ensureConnected();
    
    if (Array.isArray(command)) {
      // Handle array-style commands
      const [cmd, ...args] = command;
      const stringArgs = args.map(arg => {
        if (typeof arg === 'string' || typeof arg === 'number') {
          return arg.toString();
        }
        // Ensure all arguments are strings for Valkey GLIDE compatibility
        return String(arg);
      });
      
      return await client.customCommand([cmd.toString(), ...stringArgs]);
    } else if (typeof command === 'object' && command.name && command.args) {
      // Handle object-style commands
      const stringArgs = command.args.map((arg: any) => {
        if (Array.isArray(arg)) {
          // Ensure array commands are also properly serialized
          return arg.map(item => String(item));
        }
        return String(arg);
      });
      
      return await client.customCommand([command.name, ...stringArgs.flat()]);
    }
    
    throw new Error('Invalid command format');
  }

  async client(subcommand: string, ...args: any[]): Promise<any> {
    const client = await this.ensureConnected();
    return await client.customCommand(['CLIENT', subcommand, ...args.map(String)]);
  }

  // Status property for compatibility
  get status(): string {
    return this.connectionStatus;
  }

  // Core utility methods
  protected async ensureConnected(): Promise<GlideClient> {
    if (!this.glideClient || this.connectionStatus !== 'connected') {
      await this.connect();
    }
    return this.glideClient!;
  }

  protected async createSubscriberConnection(): Promise<GlideClient> {
    if (this.subscriberClient) {
      return this.subscriberClient;
    }

    const config: GlideClientConfiguration = {
      addresses: [{ host: this.options.host!, port: this.options.port! }],
      databaseId: this.options.db || 0,
    };

    if (this.options.username || this.options.password) {
      config.credentials = {
        username: this.options.username || 'default',
        password: this.options.password!,
      };
    }

    this.subscriberClient = await GlideClient.createClient(config);
    return this.subscriberClient;
  }

  // Abstract methods that must be implemented by concrete classes
  abstract duplicate(override?: Partial<RedisOptions>): Promise<any>;
  abstract pipeline(): any;
  abstract multi(): any;
  abstract defineCommand(name: string, options: { lua: string; numberOfKeys?: number }): void;
}
