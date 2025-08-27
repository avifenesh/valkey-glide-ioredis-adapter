/**
 * Transaction Commands - Redis transaction and pipeline operations
 */

import { GlideClient, Script } from '@valkey/valkey-glide';
import { RedisKey } from '../../types';
import { ParameterTranslator } from '../../utils/ParameterTranslator';

export class TransactionCommands {
  constructor(private getClient: () => Promise<GlideClient>) {}

  // Script operations
  async script(subcommand: string, ...args: any[]): Promise<any> {
    const client = await this.getClient();
    return await client.customCommand(['SCRIPT', subcommand, ...args.map(String)]);
  }

  // Watch/Unwatch for transactions
  async watch(...keys: RedisKey[]): Promise<string> {
    const client = await this.getClient();
    const normalizedKeys = keys.map(ParameterTranslator.normalizeKey);
    await client.customCommand(['WATCH', ...normalizedKeys]);
    return 'OK';
  }

  async unwatch(): Promise<string> {
    const client = await this.getClient();
    await client.customCommand(['UNWATCH']);
    return 'OK';
  }

  // Lua script execution
  async eval(script: string, numKeys: number, ...keysAndArgs: any[]): Promise<any> {
    const client = await this.getClient();
    const keys = keysAndArgs.slice(0, numKeys).map(ParameterTranslator.normalizeKey);
    const args = keysAndArgs.slice(numKeys).map(arg => ParameterTranslator.normalizeValue(arg));
    
    try {
      const scriptObj = new Script(script);
      const result = await client.invokeScript(scriptObj, { keys, args });
      
      // Handle null return for empty Lua results
      if (result === null && (script.includes('return {}') || script.includes('return nil'))) {
        return [];
      }
      
      return result;
    } catch (error) {
      // Fallback to direct EVAL if invokeScript fails
      const commandArgs = [script, numKeys.toString(), ...keys, ...args];
      const fallbackResult = await client.customCommand(['EVAL', ...commandArgs]);
      
      if (fallbackResult === null && (script.includes('return {}') || script.includes('return nil'))) {
        return [];
      }
      
      return fallbackResult;
    }
  }

  async evalsha(sha: string, numKeys: number, ...keysAndArgs: any[]): Promise<any> {
    const client = await this.getClient();
    const keys = keysAndArgs.slice(0, numKeys).map(ParameterTranslator.normalizeKey);
    const args = keysAndArgs.slice(numKeys).map(arg => ParameterTranslator.normalizeValue(arg));
    
    const commandArgs = [sha, numKeys.toString(), ...keys, ...args];
    return await client.customCommand(['EVALSHA', ...commandArgs]);
  }

  // Define custom commands (for Bull/BullMQ compatibility)
  defineCommand(name: string, options: { lua: string; numberOfKeys?: number }, target: any): void {
    const { lua, numberOfKeys = 0 } = options;
    
    target[name] = async (...args: any[]): Promise<any> => {
      const client = await this.getClient();
      const numkeys = Number(numberOfKeys) || 0;
      
      let keys: any[];
      let argv: any[];
      
      // Handle both BullMQ's single-array argument pattern and ioredis's variadic pattern
      if (args.length === 1 && Array.isArray(args[0])) {
        // BullMQ style: single array argument
        const allArgs = args[0];
        keys = allArgs.slice(0, numkeys);
        argv = allArgs.slice(numkeys);
      } else {
        // ioredis style: variadic arguments
        keys = args.slice(0, numkeys);
        argv = args.slice(numkeys);
      }
      
      const normalizedKeys = keys.map(k => ParameterTranslator.normalizeKey(k));
      const normalizedArgs = argv.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
          return JSON.stringify(arg);
        }
        return ParameterTranslator.normalizeValue(arg);
      });
      
      try {
        const scriptObj = new Script(lua);
        const result = await client.invokeScript(scriptObj, { 
          keys: normalizedKeys, 
          args: normalizedArgs 
        });
        
        // Handle null return for empty Lua results - critical for Bull compatibility
        if (result === null && (lua.includes('return {}') || lua.includes('return nil'))) {
          return [];
        }
        
        return result;
      } catch (error) {
        // Fallback to direct EVAL if invokeScript fails
        const commandArgs = [lua, numkeys.toString(), ...normalizedKeys, ...normalizedArgs];
        const fallbackResult = await client.customCommand(['EVAL', ...commandArgs]);
        
        if (fallbackResult === null && (lua.includes('return {}') || lua.includes('return nil'))) {
          return [];
        }
        
        return fallbackResult;
      }
    };
  }
}
