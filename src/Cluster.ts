/**
 * Cluster - Valkey/Redis Cluster client (External API)
 * Drop-in replacement for ioredis Cluster class
 * Wraps internal ClusterClient with ioredis-compatible naming
 */

import { ClusterClient, ClusterNode, ClusterOptions } from './ClusterClient';
import { GlideFt } from '@valkey/valkey-glide';

// Re-export types for external API
export { ClusterNode, ClusterOptions };

export class Cluster extends ClusterClient {
  // ioredis-style constructor
  constructor(nodes: ClusterNode[], options: ClusterOptions = {}) {
    super(nodes, options);
  }

  // Bull/BullMQ createClient factory method
  static createClient(
    type: 'client' | 'subscriber' | 'bclient',
    options: ClusterOptions & { nodes: ClusterNode[] }
  ): Cluster {
    const client = new Cluster(options.nodes, options);
    (client as any).clientType = type;

    // Enable blocking operations for bclient type
    if (type === 'bclient') {
      (client as any).enableBlockingOps = true;
    }

    return client;
  }

  // ioredis compatibility method
  duplicate(override?: Partial<ClusterOptions>): Cluster {
    const duplicated = new Cluster(this.clusterNodes, {
      ...this.clusterOptions,
      ...override,
    });

    // Preserve instance properties
    if ((this as any).enableBlockingOps) {
      (duplicated as any).enableBlockingOps = (this as any).enableBlockingOps;
    }
    if ((this as any).clientType) {
      (duplicated as any).clientType = (this as any).clientType;
    }

    return duplicated;
  }

  // === Search Commands (Valkey Search / RediSearch) ===
  
  /**
   * Lists all indexes.
   */
  async ftList(): Promise<string[]> {
    const client = await (this as any).ensureConnected();
    const result = await GlideFt.list(client);
    return result.map(index => String(index));
  }

  /**
   * Creates an index and initiates a backfill of that index.
   */
  async ftCreate(indexNameOrConfig: string | any, schema?: any, options?: any): Promise<string> {
    const client = await (this as any).ensureConnected();
    
    let actualIndexName: string;
    let glideSchema = [];
    let glideOptions = options;
    
    // Handle different input formats for compatibility
    if (typeof indexNameOrConfig === 'object' && indexNameOrConfig.index_name) {
      // Test format: entire index config as first parameter
      actualIndexName = indexNameOrConfig.index_name;
      
      if (indexNameOrConfig.schema_fields && Array.isArray(indexNameOrConfig.schema_fields)) {
        // Convert from ioredis test format
        glideSchema = indexNameOrConfig.schema_fields.map((field: any) => ({
            type: field.field_type,
            name: field.field_name,
            attributes: field.field_options ? this.parseFieldOptions(field.field_options, field.field_type) : undefined
          }));
      }
      
      // Extract index options
      if (indexNameOrConfig.index_options) {
        glideOptions = this.parseIndexOptions(indexNameOrConfig.index_options);
      }
    } else {
      // Standard format: indexName as string, schema as separate parameter
      actualIndexName = indexNameOrConfig;
      
      if (schema && typeof schema === 'object') {
        if (schema.schema_fields && Array.isArray(schema.schema_fields)) {
          // Convert from ioredis test format
          glideSchema = schema.schema_fields.map((field: any) => ({
              type: field.field_type,
              name: field.field_name,
              attributes: field.field_options ? this.parseFieldOptions(field.field_options, field.field_type) : undefined
            }));
          
          // Extract index options
          if (schema.index_options) {
            glideOptions = this.parseIndexOptions(schema.index_options);
          }
        } else if (Array.isArray(schema)) {
          // Direct GLIDE format
          glideSchema = schema;
        }
      }
    }
    
    const result = await GlideFt.create(client, actualIndexName, glideSchema, glideOptions);
    return result;
  }
  
  /**
   * Helper to parse field options from test format to GLIDE format
   */
  private parseFieldOptions(options: string[], fieldType: string): any {
    if (fieldType === 'VECTOR') {
      // Parse vector field options
      const attrs: any = {};
      
      // Handle RediSearch format: [ALGORITHM, INITIAL_CAPACITY, KEY1, VALUE1, KEY2, VALUE2, ...]
      if (options.length >= 2) {
        // First element is algorithm
        const algorithm = options[0];
        attrs.algorithm = algorithm;
        
        // Second element is initial capacity (skip for GLIDE)
        
        // Parse remaining key-value pairs
        for (let i = 2; i < options.length; i += 2) {
          const key = options[i];
          const value = options[i + 1];
          
          switch (key) {
            case 'TYPE':
              attrs.type = value;
              break;
            case 'DIM':
              attrs.dimensions = parseInt(value || '0');
              break;
            case 'DISTANCE_METRIC':
              attrs.distanceMetric = value;
              break;
          }
        }
      }
      
      return attrs;
    }
    return {};
  }
  
  /**
   * Helper to parse index options from test format to GLIDE format
   */
  private parseIndexOptions(options: string[]): any {
    const opts: any = {};
    
    for (let i = 0; i < options.length; i++) {
      if (options[i] === 'ON') {
        opts.dataType = options[i + 1];
        i++;
      } else if (options[i] === 'PREFIX') {
        const count = parseInt(options[i + 1] || '0');
        i++; // skip count
        const prefixes = [];
        for (let j = 0; j < count; j++) {
          prefixes.push(options[i + 1 + j]);
        }
        opts.prefixes = prefixes;
        i += count;
      }
    }
    
    return opts;
  }

  /**
   * Returns information about a given index.
   */
  async ftInfo(indexName: string): Promise<any> {
    const client = await (this as any).ensureConnected();
    const result = await GlideFt.info(client, indexName);
    return result;
  }

  /**
   * Deletes an index and associated content.
   */
  async ftDrop(indexName: string, _deleteDocuments?: boolean): Promise<string> {
    const client = await (this as any).ensureConnected();
    const result = await GlideFt.dropindex(client, indexName);
    return result;
  }

  /**
   * Uses the provided query expression to locate keys within an index.
   */
  async ftSearch(indexName: string, query: string, options?: any): Promise<any> {
    const client = await (this as any).ensureConnected();
    const result = await GlideFt.search(client, indexName, query, options);
    return result;
  }

  /**
   * Runs a search query on an index, and perform aggregate transformations on the results.
   */
  async ftAggregate(indexName: string, query: string, options?: any): Promise<any> {
    const client = await (this as any).ensureConnected();
    const result = await GlideFt.aggregate(client, indexName, query, options);
    return result;
  }

  /**
   * Parse a query and return information about how that query was parsed.
   */
  async ftExplain(indexName: string, query: string): Promise<string> {
    const client = await (this as any).ensureConnected();
    try {
      const result = await GlideFt.explain(client, indexName, query);
      return String(result);
    } catch (error: any) {
      // FT.EXPLAIN may not be available in all Search module versions
      if (error.message && error.message.includes('unknown command')) {
        throw new Error(`FT.EXPLAIN command is not available in this Search module version. Query: ${query}`);
      }
      throw error;
    }
  }

  /**
   * Legacy compatibility - Add document to index
   */
  async ftAdd(_indexName: string, docId: string, _score: number, fields: Record<string, any>): Promise<string> {
    const client = await (this as any).ensureConnected();
    await client.customCommand(['HSET', docId, ...Object.entries(fields).flat()]);
    return 'OK';
  }

  /**
   * Legacy compatibility - Get document by ID
   */
  async ftGet(_indexName: string, docId: string): Promise<Record<string, string> | null> {
    const client = await (this as any).ensureConnected();
    const result = await client.customCommand(['HGETALL', docId]);
    if (!result || (Array.isArray(result) && result.length === 0)) {
      return null;
    }
    
    if (Array.isArray(result)) {
      const obj: Record<string, string> = {};
      for (let i = 0; i < result.length; i += 2) {
        obj[String(result[i])] = String(result[i + 1]);
      }
      return obj;
    }
    
    return result;
  }

  /**
   * Legacy compatibility - Delete document from index
   */
  async ftDel(_indexName: string, docId: string): Promise<number> {
    const client = await (this as any).ensureConnected();
    const result = await client.customCommand(['DEL', docId]);
    return typeof result === 'number' ? result : 1;
  }

  /**
   * Vector search functionality
   */
  async ftVectorSearch(indexName: string, query: string, options?: any): Promise<any> {
    return await this.ftSearch(indexName, query, options);
  }
}

export default Cluster;
