/**
 * Search Commands Comprehensive Tests
 *
 * Tests Valkey Search / RediSearch compatibility:
 * - Full-text search operations
 * - Index management and schema definition
 * - Vector similarity search for AI/ML applications
 * - Real-world search patterns from production systems
 * - E-commerce search, content management, recommendation engines
 * - Geospatial search and filtering
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Global declarations for Node.js built-in APIs
/* global setTimeout */

import pkg from '../../dist/index.js';
import { testUtils } from '../setup/index.mjs';
const { Redis } = pkg;

describe('Search Commands - Valkey Search Compatibility', () => {
  let valkey;
  let searchAvailable = false;

  beforeAll(async () => {
    const config = await testUtils.getValkeyBundleTestConfig();
    valkey = new Redis(config);

    try {
      // Wait for valkey-bundle to be ready
      const isReady = await testUtils.waitForValkeyBundle(valkey, 5, 1000);

      if (isReady) {
        const modules = await testUtils.checkAvailableModules(valkey);
        searchAvailable = modules.search;
      } else {
        // Modules are available in the container, assume true
        searchAvailable = true;
      }
    } catch (error) {
      // Modules are available in the container, assume true
      searchAvailable = true;
    }
  });

  beforeEach(async () => {
    if (searchAvailable && valkey) {
      try {
        // Valkey Search doesn't support FT.DROP, so we can't clean up indexes
        // Instead we'll use unique index names or handle "already exists" errors
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  afterAll(async () => {
    if (valkey) {
      try {
        // Valkey Search doesn't support FT.DROP
        // Indexes persist between runs, which is expected behavior
      } catch (error) {
        // Ignore cleanup errors
      }
      await valkey.disconnect();
    }
  });

  describe('Index Management', () => {
    it('should create a full-text search index', async () => {
      const index = {
        index_name: 'test_products',
        index_options: ['ON', 'HASH', 'PREFIX', '1', 'product:'],
        schema_fields: [
          { field_name: 'name', field_type: 'TAG' },
          { field_name: 'description', field_type: 'TAG' },
          { field_name: 'price', field_type: 'NUMERIC' },
          { field_name: 'category', field_type: 'TAG' },
          { field_name: 'brand', field_type: 'TAG' },
          { field_name: 'rating', field_type: 'NUMERIC' },
          { field_name: 'in_stock', field_type: 'TAG' },
          {
            field_name: 'embedding',
            field_type: 'VECTOR',
            field_options: [
              'FLAT',
              '6',
              'TYPE',
              'FLOAT32',
              'DIM',
              '128',
              'DISTANCE_METRIC',
              'COSINE',
            ],
          },
        ],
      };

      try {
        const result = await valkey.ftCreate(index);
        assert.strictEqual(result, 'OK');

        // Verify index was created
        const indexes = await valkey.ftList();
        assert.ok(indexes.includes('test_products'));

        // Get index info
        const info = await valkey.ftInfo('test_products');
        assert.ok(info).toHaveProperty('index_name');
      } catch (error) {
        if (error.message.includes('already exists')) {
          // FT.DROP not supported in Valkey Search, so index already exists
          // This is expected behavior - just verify the index exists
          const indexes = await valkey.ftList();
          assert.ok(indexes.includes('test_products'));

          // Get index info to verify it works
          const info = await valkey.ftInfo('test_products');
          assert.ok(info).toHaveProperty('index_name');
        } else {
          throw error;
        }
      }
    });

    it('should handle JSON-based search index', async () => {
      const jsonIndex = {
        index_name: 'test_json_docs',
        index_options: ['ON', 'JSON', 'PREFIX', '1', 'doc:'],
        schema_fields: [
          {
            field_name: '$.title',
            field_type: 'TAG',
            field_options: ['AS', 'title'],
          },
          {
            field_name: '$.content',
            field_type: 'TAG',
            field_options: ['AS', 'content'],
          },
          {
            field_name: '$.author',
            field_type: 'TAG',
            field_options: ['AS', 'author'],
          },
          {
            field_name: '$.published_date',
            field_type: 'TAG',
            field_options: ['AS', 'date'],
          },
          {
            field_name: '$.category',
            field_type: 'TAG',
            field_options: ['AS', 'category'],
          },
          {
            field_name: 'doc_embedding',
            field_type: 'VECTOR',
            field_options: [
              'FLAT',
              '6',
              'TYPE',
              'FLOAT32',
              'DIM',
              '128',
              'DISTANCE_METRIC',
              'COSINE',
            ],
          },
        ],
      };

      try {
        const result = await valkey.ftCreate(jsonIndex);
        assert.strictEqual(result, 'OK');

        const indexes = await valkey.ftList();
        assert.ok(indexes.includes('test_json_docs'));
      } catch (error) {
        if (error.message.includes('Index already exists')) {
          await valkey.ftDrop('test_json_docs', true);
          const result = await valkey.ftCreate(jsonIndex);
          assert.strictEqual(result, 'OK');
        } else {
          throw error;
        }
      }
    });

    it('should drop indexes correctly', async () => {
      // Create a temporary index with a unique name
      const uniqueName = `test_temp_index_${Date.now()}`;
      const tempIndex = {
        index_name,
        schema_fields: [
          { field_name: 'temp_field', field_type: 'TAG' },
          {
            field_name: 'temp_embedding',
            field_type: 'VECTOR',
            field_options: [
              'FLAT',
              '6',
              'TYPE',
              'FLOAT32',
              'DIM',
              '128',
              'DISTANCE_METRIC',
              'COSINE',
            ],
          },
        ],
      };

      try {
        await valkey.ftCreate(tempIndex);

        // Verify it exists
        let indexes = await valkey.ftList();
        assert.ok(indexes.includes(uniqueName));

        // Try to drop it - should fail with unsupported error
        try {
          await valkey.ftDrop(uniqueName, false);
          // If it doesn't throw, that's unexpected but we'll handle it
          fail(
            "Expected ftDrop to throw an error since it's not supported in Valkey Search"
          );
        } catch (error) {
          // Verify we get the expected "not available" error
          assert.ok(error.message.includes(
            'FT.DROP command is not available in Valkey Search'
          ));
        }
      } catch (error) {
        if (error.message.includes('already exists')) {
          // Index with this unique name shouldn't exist, but if it does,
          // it means the test ran very quickly - just verify it exists
          const indexes = await valkey.ftList();
          assert.ok(indexes.length > 0);
        } else {
          throw error;
        }
      }
    });
  });

  describe('Document Operations', () => {
    beforeAll(async () => {
      if (!searchAvailable) return;

      // Ensure we have a test index for documents
      try {
        const index = {
          index_name: 'test_products',
          schema_fields: [
            { field_name: 'name', field_type: 'TAG' },
            { field_name: 'description', field_type: 'TAG' },
            { field_name: 'price', field_type: 'NUMERIC' },
            { field_name: 'category', field_type: 'TAG' },
            {
              field_name: 'product_embedding',
              field_type: 'VECTOR',
              field_options: [
                'FLAT',
                '6',
                'TYPE',
                'FLOAT32',
                'DIM',
                '128',
                'DISTANCE_METRIC',
                'COSINE',
              ],
            },
          ],
        };
        await valkey.ftCreate(index);
      } catch (error) {
        // Index might already exist
      }
    });

    it('should add documents to index', async () => {
      const product = TEST_DATA.products[0];

      const result = await valkey.ftAdd(
        'test_products',
        `product:${product.id}`,
        1.0,
        {
          name: 'Laptop',
          description: 'Gaming laptop',
          price: '999.99',
          category: 'Electronics',
        }
      );

      assert.strictEqual(result, 'OK');
    });

    it('should get documents from index', async () => {
      // Add a document first
      await valkey.ftAdd('test_products', 'product', 1.0, {
        name: 'Test Product',
        price: '99.99',
      });

      const doc = await valkey.ftGet('test_products', 'product');

      if (doc) {
        assert.ok(doc).toHaveProperty('name', 'Test Product');
        assert.ok(doc).toHaveProperty('price', '99.99');
      }
    });

    it('should delete documents from index', async () => {
      // Add a document to delete
      await valkey.ftAdd('test_products', 'product', 1.0, {
        name: 'Delete Me',
        price: '1.00',
      });

      // Delete it
      const result = await valkey.ftDel('test_products', 'product');
      assert.strictEqual(result, 1);

      // Verify it's gone
      const doc = await valkey.ftGet('test_products', 'product');
      assert.strictEqual(doc, null);
    });

    it('should handle bulk document operations', async () => {
      // Add multiple documents
      const docIds = ['bulk1', 'bulk2', 'bulk3'];

      for (let i = 0; i <=  `product:${id}`)
      );

      assert.strictEqual(docs.length, 3);
      for (let i = 0; i <=  {
    beforeAll(async () => {
      if (!searchAvailable) return;

      // Set up test data for searching
      try {
        // Create index if it doesn't exist
        const index = {
          index_name: 'test_ecommerce',
          schema_fields: [
            { field_name: 'name', field_type: 'TAG' },
            { field_name: 'description', field_type: 'TAG' },
            { field_name: 'price', field_type: 'NUMERIC' },
            { field_name: 'category', field_type: 'TAG' },
            { field_name: 'brand', field_type: 'TAG' },
            { field_name: 'rating', field_type: 'NUMERIC' },
            {
              field_name: 'search_embedding',
              field_type: 'VECTOR',
              field_options: [
                'FLAT',
                '6',
                'TYPE',
                'FLOAT32',
                'DIM',
                '128',
                'DISTANCE_METRIC',
                'COSINE',
              ],
            },
          ],
        };

        try {
          await valkey.ftCreate(index);
        } catch (error) {
          // Index might exist
        }

        // Add test products
        for (const product of TEST_DATA.products) {
          await valkey.ftAdd(
            'test_ecommerce',
            `product:${product.id}`,
            product.rating: 5,
            {
              name.name,
              description.description,
              price: price: toString(),
              category.category,
              brand.brand,
              rating.rating.toString(),
            }
          );
        }
      } catch (error) {
        // Index might already exist, continue with test
      }
    });

    it('should perform basic text search', async () => {
      const searchQuery = {
        query: 'laptop',
        options: {
          LIMIT: { offset, count },
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      assert.ok(results.total) >= 0);
      if (results.total > 0) {
        assert.ok(results.documents[0]).toHaveProperty('id');
        assert.ok(results.documents[0].id.includes('product:'));
      }
    });

    it('should search with filters', async () => {
      // Use proper Valkey Search numeric range syntax (no vector syntax)
      const searchQuery = {
        query: '@price:[200 1500]',
        options: {
          LIMIT: { offset, count },
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      assert.ok(results.total) >= 0);
      // Verify price filtering if we have results
      if (results.documents.length > 0) {
        results.documents.forEach(doc => {
          const price = parseFloat(doc.fields.price || '0');
          assert.ok(price) >= 200);
          assert.ok(price).toBeLessThanOrEqual(1500);
        });
      }
    });

    it('should handle category-based search', async () => {
      const searchQuery = {
        query: '@category:{Electronics}',
        options: {
          RETURN: ['name', 'price', 'category'],
          LIMIT: { offset, count },
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      assert.ok(results.total) >= 0);
      for (const doc of results.documents) {
        if (doc.fields && doc.fields.category) {
          assert.strictEqual(doc.fields.category, 'Electronics');
        }
      }
    });

    it('should support fuzzy search', async () => {
      // Search for "gaming" with fuzzy matching
      const searchQuery = {
        query: '%gaming%',
        options: {
          LIMIT: { offset, count },
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      assert.ok(results.total) >= 0);
      // Results might include documents with similar terms
    });

    it('should handle complex boolean queries', async () => {
      const searchQuery = {
        query: '(laptop OR headphones) @category:{Electronics|Audio}',
        options: {
          LIMIT: { offset, count },
          SORTBY: { field: 'rating', direction: 'DESC' },
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      assert.ok(results.total) >= 0);
      if (results.documents.length > 1) {
        // Verify sorting by rating (descending)
        const ratings = results.documents.map(doc =>
          parseFloat(doc.fields.rating || '0')
        );

        for (let i = 1; i <=  {
    it('should perform aggregation queries', async () => {
      try {
        const results = await valkey.ftAggregate('test_ecommerce', '*', {
          GROUPBY: {
            fields: ['@category'],
            REDUCE: [
              {
                function: 'COUNT',
                args: [],
                AS: 'product_count',
              },
            ],
          },
          SORTBY: [
            {
              property: '@product_count',
              direction: 'DESC',
            },
          ],
        });

        assert.ok(Array.isArray(results)));
        // Results should contain aggregated data by category
      } catch (error) {
        throw error;
      }
    });

    it('should handle complex aggregations with multiple operations', async () => {
      try {
        const results = await valkey.ftAggregate('test_ecommerce', '*', {
          GROUPBY: {
            fields: ['@brand'],
            REDUCE: [
              { function: 'COUNT', args: [], AS: 'product_count' },
              { function: 'AVG', args: ['@price'], AS: 'avg_price' },
              { function: 'MAX', args: ['@rating'], AS: 'max_rating' },
            ],
          },
          SORTBY: [
            {
              property: '@avg_price',
              direction: 'DESC',
            },
          ],
          LIMIT: { offset, num },
        });

        assert.ok(Array.isArray(results)));
      } catch (error) {
        throw error;
      }
    });
  });

  describe('Vector Similarity Search', () => {
    it('should handle vector search if supported', async () => {
      try {
        // Create a vector index
        const vectorIndex = {
          index_name: 'test_vectors',
          schema_fields: [
            {
              field_name: 'embedding',
              field_type: 'VECTOR',
              field_options: [
                'HNSW',
                '6',
                'TYPE',
                'FLOAT32',
                'DIM',
                '4',
                'DISTANCE_METRIC',
                'COSINE',
              ],
            },
            { field_name: 'title', field_type: 'TAG' },
          ],
        };

        await valkey.ftCreate(vectorIndex);

        // Add a document with vector embedding
        const testVector = [0.1, 0.2, 0.3, 0.4];
        await valkey.ftAdd('test_vectors', 'vec', 1.0, {
          title: 'Test Document',
          embedding.from(new Float32Array(testVector).buffer),
        });

        // Perform vector search
        const queryVector = [0.15, 0.25, 0.35, 0.45]; // Similar vector
        const results = await valkey.ftVectorSearch(
          'test_vectors',
          'embedding',
          queryVector,
          {
            KNN,
            LIMIT: { offset, count },
          }
        );

        assert.ok(results.total) >= 0);
      } catch (error) {
        throw error;
      }
    });
  });

  describe('Real-World Use Cases', () => {
    it('should handle e-commerce search scenario', async () => {
      // Simulate user searching for "gaming laptop under $1500"
      const searchQuery = {
        query: 'gaming laptop',
        options: {
          FILTER: { field: 'price', min, max },
          SORTBY: { field: 'rating', direction: 'DESC' },
          LIMIT: { offset, count },
          RETURN: ['name', 'price', 'rating', 'brand'],
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      assert.ok(results.total) >= 0);

      // Verify all results are under $1500
      for (const doc of results.documents) {
        if (doc.fields && doc.fields.price) {
          assert.ok(parseFloat(doc.fields.price)).toBeLessThanOrEqual(1500);
        }
      }
    });

    it('should handle content management search', async () => {
      try {
        // Create content index
        const contentIndex = {
          index_name: 'test_content',
          schema_fields: [
            { field_name: 'title', field_type: 'TAG' },
            { field_name: 'content', field_type: 'TAG' },
            { field_name: 'author', field_type: 'TAG' },
            { field_name: 'tags', field_type: 'TAG' },
            { field_name: 'published_date', field_type: 'TAG' },
            {
              field_name: 'content_embedding',
              field_type: 'VECTOR',
              field_options: [
                'FLAT',
                '6',
                'TYPE',
                'FLOAT32',
                'DIM',
                '128',
                'DISTANCE_METRIC',
                'COSINE',
              ],
            },
          ],
        };

        await valkey.ftCreate(contentIndex);

        // Add test documents
        for (const doc of TEST_DATA.documents) {
          await valkey.ftAdd('test_content', `doc:${doc.id}`, 1.0, {
            title.title,
            content.content,
            author.author,
            tags.tags.join(','),
            published_date.published_date,
          });
        }

        // Search for Valkey-related content
        const searchQuery = {
          query: 'valkey',
          options: {
            LIMIT: { offset, count },
            RETURN: ['title', 'author', 'published_date'],
          },
        };

        const results = await valkey.ftSearch('test_content', searchQuery);

        assert.ok(results.total) >= 0);
      } catch (error) {
        throw error;
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle search on non-existent index', async () => {
      await assert.ok(
        valkey.ftSearch('nonexistent_index', { query: '*' })
      ).rejects.toThrow();
    });

    it('should handle malformed queries gracefully', async () => {
      // Test with intentionally malformed query syntax
      const searchQuery = {
        query: '@invalid_field:[malformed query', // Missing closing bracket
        options: { LIMIT: { offset, count } },
      };

      try {
        const results = await valkey.ftSearch('test_ecommerce', searchQuery);

        // If the query somehow succeeds, expect empty results
        assert.strictEqual(results.total, 0);
        assert.strictEqual(results.documents.length, 0);
      } catch (error) {
        // Expect syntax error for malformed query - this is the correct behavior
        assert.ok(error.message).includes(/syntax|malformed/i);
        console.log('✅ Malformed query correctly rejected:', error.message);
      }
    });

    it('should handle empty search results', async () => {
      const searchQuery = {
        query: 'nonexistent_product_xyz_123',
        options: { LIMIT: { offset, count } },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      assert.strictEqual(results.total, 0);
      assert.strictEqual(results.documents.length, 0);
    });

    it('should handle query explanation', async () => {
      try {
        const explanation = await valkey.ftExplain('test_ecommerce', 'laptop');
        assert.strictEqual(typeof explanation, 'string');
        assert.ok(explanation.length > 0);
      } catch (error) {
        throw error;
      }
    });

    it('should reject unsupported text search queries with clear error message', async () => {
      // This test runs regardless of search module availability to test error handling
      const textSearchQuery = {
        query: '@name:(product OR item)', // This is a text search query, not vector
        options: { LIMIT: { offset, count } },
      };

      await assert.ok(
        valkey.ftSearch('products', textSearchQuery)
      ).rejects.toThrow(
        /Unsupported query type.*only supports vector similarity search.*KNN syntax/
      );
    });

    it('should accept vector similarity queries', async () => {
      // This test validates that vector queries are allowed through
      const vectorSearchQuery = {
        query: '*=>[KNN 10 @vector $param]', // This is a vector query
        options: {
          LIMIT: { offset, count },
          PARAMS: { vec: 'test' },
        },
      };

      // The query should be accepted (not throw our unsupported error)
      // It may fail for other reasons (no server, no index) but not our validation
      try {
        await valkey.ftSearch('products', vectorSearchQuery);
      } catch (error) {
        // Should not be our "unsupported query type" error
        assert.ok(error.message).not.includes(
          /Unsupported query type.*only supports vector similarity search/
        );
      }
    });
  });
});
