import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyJWT } from "../../src/lib/jwt.js";

export interface AdminUser {
  id: number;
  telegramId: string;
  isAdmin: boolean;
}

export function getAdminUser(req: VercelRequest): AdminUser | null {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  const payload = verifyJWT(token);

  if (!payload || !payload.isAdmin) {
    return null;
  }

  return {
    id: payload.sub,
    telegramId: payload.telegramId,
    isAdmin: payload.isAdmin,
  };
}

export function requireAdmin(
  req: VercelRequest,
  res: VercelResponse
): AdminUser | null {
  const admin = getAdminUser(req);

  if (!admin) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return null;
  }

  return admin;
}

export function methodNotAllowed(res: VercelResponse, allowed: string[]): void {
  res.setHeader("Allow", allowed.join(", "));
  res.status(405).json({ success: false, error: "Method not allowed" });
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export function parsePagination(req: VercelRequest): PaginationParams {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  pagination: PaginationParams
) {
  return {
    success: true,
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  };
}
