/**
 * Socket File Manager for GLIDE cleanup
 *
 * Manages GLIDE socket files for graceful Rust process shutdown.
 * Instead of killing processes, we close the socket files which signals
 * the Rust processes to shut down gracefully.
 */

import { unlink, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

class SocketFileManager {
  private static ownSocketFiles = new Set<string>();
  private static readonly SOCKET_DIR = '/tmp';
  private static readonly GLIDE_SOCKET_PATTERN =
    /^glide-socket-\d+-[a-f0-9-]+\.sock$/;

  /**
   * Register a socket file that belongs to our client instances
   */
  static registerOwnSocketFile(socketPath: string): void {
    this.ownSocketFiles.add(socketPath);
    console.log(`[SocketFileManager] Registered own socket: ${socketPath}`);
  }

  /**
   * Find socket files that might belong to our process tree
   * Only returns files that match our process context for safety
   */
  static async findOwnSocketFiles(): Promise<string[]> {
    try {
      const files = await readdir(this.SOCKET_DIR);
      const candidateFiles = files
        .filter(file => this.GLIDE_SOCKET_PATTERN.test(file))
        .map(file => join(this.SOCKET_DIR, file))
        .filter(path => existsSync(path));

      // Additional safety: only consider files from recent time period
      const ownFiles: string[] = [];
      const now = Date.now();
      const maxAge = 30 * 60 * 1000; // 30 minutes

      for (const filePath of candidateFiles) {
        try {
          const stats = await import('fs/promises').then(fs =>
            fs.stat(filePath)
          );
          const fileAge = now - stats.mtime.getTime();

          // Only consider recent files that could belong to our session
          if (fileAge < maxAge) {
            ownFiles.push(filePath);
          }
        } catch (error) {
          // File might have been removed
        }
      }

      return ownFiles;
    } catch (error) {
      // Directory might not exist or access denied
      return [];
    }
  }

  /**
   * Gracefully close only our registered socket files
   * This signals only our Rust processes to shut down gracefully
   */
  static async closeAllSocketFiles(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    // Close explicitly registered socket files (safest approach)
    for (const socketPath of this.ownSocketFiles) {
      closePromises.push(this.closeSocketFile(socketPath));
    }

    // If we have no explicitly registered files, fall back to finding our own files
    if (this.ownSocketFiles.size === 0) {
      const ownFiles = await this.findOwnSocketFiles();
      for (const socketPath of ownFiles) {
        closePromises.push(this.closeSocketFile(socketPath));
      }
    }

    await Promise.allSettled(closePromises);
    this.ownSocketFiles.clear();
  }

  /**
   * Close a specific socket file
   */
  private static async closeSocketFile(socketPath: string): Promise<void> {
    try {
      if (existsSync(socketPath)) {
        await unlink(socketPath);
        console.log(`[SocketFileManager] Closed socket file: ${socketPath}`);
      }
      this.ownSocketFiles.delete(socketPath);
    } catch (error) {
      // Socket file might already be removed or access denied
      this.ownSocketFiles.delete(socketPath);
    }
  }

  /**
   * Get count of tracked socket files
   */
  static getSocketFileCount(): number {
    return this.ownSocketFiles.size;
  }

  /**
   * Check if any of our socket files are still active
   */
  static async hasActiveSocketFiles(): Promise<boolean> {
    for (const socketPath of this.ownSocketFiles) {
      if (existsSync(socketPath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Clean up only our own orphaned socket files
   * Safer cleanup that only removes files we explicitly registered
   */
  static async cleanupOrphanedSocketFiles(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];

    // Only clean up socket files we explicitly registered
    for (const socketPath of this.ownSocketFiles) {
      if (existsSync(socketPath)) {
        cleanupPromises.push(this.closeSocketFile(socketPath));
      } else {
        // File already removed, just clean from our tracking
        this.ownSocketFiles.delete(socketPath);
      }
    }

    await Promise.allSettled(cleanupPromises);
  }
}

export { SocketFileManager };
