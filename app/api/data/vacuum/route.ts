// POST /api/data/vacuum - Optimize database by running VACUUM
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDatabase, initializeDatabase, getDatabasePath } from '@/lib/db';
import fs from 'fs';

export async function POST() {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    const dbPath = getDatabasePath();

    // Get size before optimization
    let sizeBefore = 0;
    try {
      const statsBefore = fs.statSync(dbPath);
      sizeBefore = statsBefore.size;
    } catch {
      // File might not exist
    }

    initializeDatabase();
    const db = getDatabase();

    // Run VACUUM to optimize the database
    db.exec('VACUUM');

    // Get size after optimization
    let sizeAfter = 0;
    try {
      const statsAfter = fs.statSync(dbPath);
      sizeAfter = statsAfter.size;
    } catch {
      // File might not exist
    }

    const savedBytes = sizeBefore - sizeAfter;

    return NextResponse.json({
      success: true,
      sizeBefore,
      sizeAfter,
      savedBytes,
      message: savedBytes > 0
        ? `Database optimized. Saved ${formatBytes(savedBytes)}.`
        : 'Database is already optimized.',
    });
  } catch (error) {
    console.error('VACUUM error:', error);
    return NextResponse.json(
      { error: 'Failed to optimize database' },
      { status: 500 }
    );
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
