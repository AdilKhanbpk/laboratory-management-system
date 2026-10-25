import { DatabaseManager } from '../connection';

export interface AuditLogEntry {
  id: number;
  user_id: number | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  details_json: string;
}

export class AuditRepository {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * Sanitizes details object to guarantee no secrets, passwords, or keys are ever logged.
   */
  private sanitizeDetails(details: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    const sensitiveKeys = ['password', 'hash', 'salt', 'key', 'token', 'passphrase', 'secret'];

    for (const [key, value] of Object.entries(details)) {
      const lower = key.toLowerCase();
      if (sensitiveKeys.some((s) => lower.includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeDetails(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  public logAction(params: {
    userId?: number | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Record<string, any>;
  }): void {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();
    const cleanDetails = this.sanitizeDetails(params.details || {});

    const stmt = db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, created_at, details_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      params.userId ?? null,
      params.action,
      params.entityType,
      params.entityId ?? null,
      now,
      JSON.stringify(cleanDetails)
    );
  }

  public getRecentLogs(limit = 50): AuditLogEntry[] {
    const db = this.dbManager.getDatabase();
    const rows = db.prepare(`
      SELECT a.*, u.username, u.full_name
      FROM audit_logs a
      LEFT JOIN app_users u ON a.user_id = u.id
      ORDER BY a.id DESC
      LIMIT ?
    `).all(limit);

    return rows as AuditLogEntry[];
  }

  public getLogs(params: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  } = {}): { logs: AuditLogEntry[]; total: number; hasMore: boolean } {
    const db = this.dbManager.getDatabase();
    const conditions: string[] = [];
    const sqlParams: any[] = [];

    if (params.startDate) {
      conditions.push(`a.created_at >= ?`);
      sqlParams.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push(`a.created_at <= ?`);
      sqlParams.push(params.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db.prepare(`
      SELECT COUNT(*) as count
      FROM audit_logs a
      ${whereClause}
    `).get(...sqlParams) as { count: number };

    const total = countRow.count;
    const limit = Math.max(1, Math.min(500, params.limit ?? 100));
    const offset = Math.max(0, params.offset ?? 0);

    const rows = db.prepare(`
      SELECT a.*, u.username, u.full_name
      FROM audit_logs a
      LEFT JOIN app_users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ? OFFSET ?
    `).all(...sqlParams, limit, offset) as AuditLogEntry[];

    return {
      logs: rows,
      total,
      hasMore: offset + rows.length < total,
    };
  }
}

