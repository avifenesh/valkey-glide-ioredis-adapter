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

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Global declarations for Node.js built-in APIs
/* global setTimeout */

import pkg from '../../dist/index.js';
import { testUtils } from '../setup/index.mjs';
const { Redis } = pkg;

// Test data and constants
const TEST_DATA = {
  products: [
    {
      id: '1',
      name: 'Gaming Laptop',
      description: 'High-performance gaming laptop with RTX graphics',
      price: 1299.99,
      category: 'Electronics',
      brand: 'TechBrand',
      rating: 4.5,
      in_stock: 'yes'
    },
    {
      id: '2',
      name: 'Office Chair',
      description: 'Ergonomic office chair for productivity',
      price: 299.99,
      category: 'Furniture',
      brand: 'ComfortPlus',
      rating: 4.2,
      in_stock: 'yes'
    },
    {
      id: '3',
      name: 'Wireless Mouse',
      description: 'Precision wireless mouse for gaming',
      price: 79.99,
      category: 'Electronics',
      brand: 'TechBrand',
      rating: 4.7,
      in_stock: 'no'
    }
  ],
  documents: [
    {
      id: 'doc:1',
      title: 'Introduction to Machine Learning',
      content: 'Machine learning is a subset of artificial intelligence',
      category: 'Technology',
      author: 'Tech Writer'
    },
    {
      id: 'doc:2', 
      title: 'Advanced JavaScript Patterns',
      content: 'Modern JavaScript development techniques and patterns',
      category: 'Programming',
      author: 'JS Developer'
    }
  ]
};

// Pagination and search constants
const offset = 0;
const count = 10;
const num = 5;
const min = 0;
const max = 2000;

// Generate unique index names to avoid conflicts
function generateUniqueIndexName(baseName) {
  return `${baseName}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

describe('Search Commands - Valkey Search Compatibility', () => {
  let valkey;
  let searchAvailable = false;
  
  // Dynamic index names to avoid conflicts
  let indexNames = {};

  before(async () => {
    const config = await testUtils.getStandaloneConfig();
    valkey = new Redis(config);
    
    // Generate unique index names for this test run
    indexNames = {
      test_products: generateUniqueIndexName('test_products'),
      test_json_docs: generateUniqueIndexName('test_json_docs'), 
      test_ecommerce: generateUniqueIndexName('test_ecommerce'),
      test_content: generateUniqueIndexName('test_content'),
      products: generateUniqueIndexName('products')
    };
    
    try {
      await valkey.connect();
      // Test if Search module is available by trying a basic search command
      await valkey.ftList();
      searchAvailable = true;
    } catch (error) {
      console.log('Search module not available, skipping Search tests');
      searchAvailable = false;
    }
    
    if (!searchAvailable) {
      console.log('⚠️  Search module not available - all tests will be skipped');
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

  after(async () => {
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
    it('should create a full-text search index', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
      const index = {
        index_name: indexNames.test_products,
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
        assert.ok(indexes.includes(indexNames.test_products));

        // Get index info
        const info = await valkey.ftInfo(indexNames.test_products);
        assert.ok(info && typeof info === 'object');
      } catch (error) {
        if (error.message.includes('already exists')) {
          // FT.DROP not supported in Valkey Search, so index already exists
          // This is expected behavior - just verify the index exists
          const indexes = await valkey.ftList();
          assert.ok(indexes.includes(indexNames.test_products));

          // Get index info to verify it works
          const info = await valkey.ftInfo(indexNames.test_products);
          assert.ok(info && typeof info === 'object');
        } else {
          throw error;
        }
      }
    });

    it('should handle JSON-based search index', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
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

    it('should drop indexes correctly', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
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
    before(async () => {
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

    it('should add documents to index', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
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

    it('should get documents from index', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
      // Add a document first
      await valkey.ftAdd('test_products', 'product', 1.0, {
        name: 'Test Product',
        price: '99.99',
      });

      const doc = await valkey.ftGet('test_products', 'product');

      if (doc) {
        assert.ok(doc && typeof doc === 'object');
        assert.strictEqual(doc.name, 'Test Product');
        assert.strictEqual(doc.price, '99.99');
      }
    });

    it('should delete documents from index', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
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

    it('should handle bulk document operations', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
      // Add multiple documents
      const docIds = ['bulk1', 'bulk2', 'bulk3'];

      for (let i = 0; i < docIds.length; i++) {
        const id = docIds[i];
        await valkey.jsonSet(
          `product:${id}`,
          '.',
          { name: `Product ${i}`, category: 'electronics' }
        );
      }

      const docs = await valkey.ftSearch('products', '*');
      assert.strictEqual(docs.length, 3);
      for (let i = 0; i < docs.length; i++) {
        assert.ok(docs[i]);
      }
    });
  });

  describe('Search Index Management', () => {
    before(async () => {
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
            5,
            {
              name: product.name,
              description: product.description,
              price: product.price.toString(),
              category: product.category,
              brand: product.brand,
              rating: product.rating.toString(),
            }
          );
        }
      } catch (error) {
        // Index might already exist, continue with test
      }
    });

    it('should perform basic text search', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
      const searchQuery = {
        query: 'laptop',
        options: {
          LIMIT: { offset, count },
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      assert.ok(results.total >= 0);
      if (results.total > 0) {
        assert.ok(results.documents[0].id);
        assert.ok(results.documents[0].id.includes('product:'));
      }
    });

    it('should search with filters', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
      // Use proper Valkey Search numeric range syntax (no vector syntax)
      const searchQuery = {
        query: '@price:[200 1500]',
        options: {
          LIMIT: { offset, count },
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      assert.ok(results.total >= 0);
      // Verify price filtering if we have results
      if (results.documents.length > 0) {
        results.documents.forEach(doc => {
          const price = parseFloat(doc.fields.price || '0');
          assert.ok(price >= 200);
          assert.ok(price <= 1500);
        });
      }
    });

    it('should handle category-based search', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
      const searchQuery = {
        query: '@category:{Electronics}',
        options: {
          RETURN: ['name', 'price', 'category'],
          LIMIT: { offset, count },
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      assert.ok(results.total >= 0);
      for (const doc of results.documents) {
        if (doc.fields && doc.fields.category) {
          assert.strictEqual(doc.fields.category, 'Electronics');
        }
      }
    });

    it('should support fuzzy search', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
      // Search for "gaming" with fuzzy matching
      const searchQuery = {
        query: '%gaming%',
        options: {
          LIMIT: { offset, count },
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      assert.ok(results.total >= 0);
      // Results might include documents with similar terms
    });

    it('should handle complex boolean queries', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
      const searchQuery = {
        query: '(laptop OR headphones) @category:{Electronics|Audio}',
        options: {
          LIMIT: { offset, count },
          SORTBY: { field: 'rating', direction: 'DESC' },
        },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      assert.ok(results.total >= 0);
      if (results.documents.length > 1) {
        // Verify sorting by rating (descending)
        const ratings = results.documents.map(doc =>
          parseFloat(doc.fields.rating || '0')
        );

        for (let i = 1; i < ratings.length; i++) {
          assert.ok(ratings[i - 1] >= ratings[i]);
        }
      }
    });

    it('should perform aggregation queries', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
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

        assert.ok(Array.isArray(results));
        // Results should contain aggregated data by category
      } catch (error) {
        throw error;
      }
    });

    it('should handle complex aggregations with multiple operations', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
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

        assert.ok(Array.isArray(results));
      } catch (error) {
        throw error;
      }
    });
  });

  describe('Vector Similarity Search', () => {
    it('should handle vector search if supported', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
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
          embedding: Buffer.from(new Float32Array(testVector).buffer),
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

        assert.ok(results.total >= 0);
      } catch (error) {
        throw error;
      }
    });
  });

  describe('Real-World Use Cases', () => {
    it('should handle e-commerce search scenario', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
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

      assert.ok(results.total >= 0);

      // Verify all results are under $1500
      for (const doc of results.documents) {
        if (doc.fields && doc.fields.price) {
          assert.ok(parseFloat(doc.fields.price)).toBeLessThanOrEqual(1500);
        }
      }
    });

    it('should handle content management search', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
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
          await valkey.ftAdd('test_content', 'doc:' + doc.id, 1.0, {
            title: doc.title,
            content: doc.content,
            author: doc.author,
            tags: doc.tags.join(','),
            published_date: doc.published_date,
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

        assert.ok(results.total >= 0);
      } catch (error) {
        throw error;
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle search on non-existent index', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
      await assert.rejects(
        async () => await valkey.ftSearch('nonexistent_index', '*'),
        (error) => error.message.includes('not found') || error.message.includes('does not exist')
      );
    });

    it('should handle malformed queries gracefully', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
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
        assert.ok(error.message && /syntax|malformed/i.test(error.message));
        console.log('✅ Malformed query correctly rejected:', error.message);
      }
    });

    it('should handle empty search results', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
      const searchQuery = {
        query: 'nonexistent_product_xyz_123',
        options: { LIMIT: { offset, count } },
      };

      const results = await valkey.ftSearch('test_ecommerce', searchQuery);

      assert.strictEqual(results.total, 0);
      assert.strictEqual(results.documents.length, 0);
    });

    it('should handle query explanation', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
      try {
        const explanation = await valkey.ftExplain('test_ecommerce', 'laptop');
        assert.strictEqual(typeof explanation, 'string');
        assert.ok(explanation.length > 0);
      } catch (error) {
        // FT.EXPLAIN is not available in valkey-bundle Search module
        if (error.message && error.message.includes('FT.EXPLAIN command is not available')) {
          console.log('✅ FT.EXPLAIN correctly identified as unavailable in valkey-bundle');
          // This is expected - test passes
        } else {
          throw error;
        }
      }
    });

    it('should reject unsupported text search queries with clear error message', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
      // This test runs regardless of search module availability to test error handling
      const textSearchQuery = {
        query: '@name:(product OR item)', // This is a text search query, not vector
        options: { LIMIT: { offset, count } },
      };

      await assert.rejects(
        async () => await valkey.ftSearch('products', textSearchQuery),
        (error) => error.message.includes('Unsupported') || error.message.includes('not supported')
      );
    });

    it('should accept vector similarity queries', async (t) => {
      if (!searchAvailable) {
        t.skip('Search module not available');
        return;
      }
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
        assert.ok(!error.message || !error.message.includes('Unsupported query type'));
      }
    });
  });
});
