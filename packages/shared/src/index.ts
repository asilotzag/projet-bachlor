/**
 * Types et constantes partagés entre l'API et le frontend.
 * Importer via : import { ROLES, type Role } from '@pfe/shared'
 */

/** Rôles RBAC de l'application. */
export const ROLES = ['ADMIN', 'RH', 'MANAGER', 'EMPLOYE'] as const;
export type Role = (typeof ROLES)[number];

/** Réponse de la route de santé de l'API. */
export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  time: string;
}

/** Utilisateur exposé au frontend (jamais le hash du mot de passe). */
export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}
