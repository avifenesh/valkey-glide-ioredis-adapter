const { Redis } = require('./dist/index.js');

async function debug() {
  const redis = new Redis({
    host: process.env.VALKEY_BUNDLE_HOST || 'localhost',
    port: parseInt(process.env.VALKEY_BUNDLE_PORT || '6380')
  });
  
  try {
    // Clear and set up test data
    await redis.del('testzset');
    await redis.zadd('testzset', 1, 'one', 2, 'two', 3, 'three', 4, 'four');
    
    console.log('=== ZSET Debug ===');
    console.log('Data setup - added: one(1), two(2), three(3), four(4)');
    
    // Test basic zrange
    const all = await redis.zrange('testzset', 0, -1);
    console.log('ZRANGE 0 -1:', all);
    
    // Test zrangebyscore (working)
    const forward = await redis.zrangebyscore('testzset', 1, 3);
    console.log('ZRANGEBYSCORE 1 3:', forward);
    
    // Test zrevrangebyscore (not working)
    const reverse = await redis.zrevrangebyscore('testzset', 3, 1);
    console.log('ZREVRANGEBYSCORE 3 1:', reverse);
    
    // Let's also check what the internal GLIDE client looks like
    console.log('Redis client methods containing "zrange":', 
      Object.getOwnPropertyNames(redis.glideClient.__proto__)
        .filter(name => name.toLowerCase().includes('zrange'))
    );
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await redis.disconnect();
  }
}

debug();