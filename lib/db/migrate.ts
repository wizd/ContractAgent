import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';

// 获取当前文件所在目录
const currentDir = path.dirname(new URL(import.meta.url).pathname);
const envPath = path.resolve(currentDir, '../../.env.local');

console.log('Loading environment variables from:', envPath);

// 尝试加载环境变量，但不强制覆盖已存在的环境变量
const result = config({
  path: envPath,
  override: false, // 不覆盖已存在的环境变量
});

if (result.error) {
  console.log('Note: .env.local not found, using environment variables instead');
} else {
  console.log('Environment variables loaded successfully');
}

const runMigrate = async () => {
  // 打印所有环境变量（用于调试）
  console.log('Available environment variables:', Object.keys(process.env));
  
  if (!process.env.POSTGRES_URL) {
    console.error(
      'POSTGRES_URL is not defined. Current environment:',
      process.env.NODE_ENV,
    );
    throw new Error('POSTGRES_URL is not defined');
  }

  const connection = postgres(process.env.POSTGRES_URL, { max: 1 });
  const db = drizzle(connection);

  console.log('⏳ Running migrations...');

  const start = Date.now();
  await migrate(db, { migrationsFolder: './lib/db/migrations' });
  const end = Date.now();

  console.log('✅ Migrations completed in', end - start, 'ms');
  process.exit(0);
};

runMigrate().catch((err) => {
  console.error('❌ Migration failed');
  console.error(err);
  process.exit(1);
});
