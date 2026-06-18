import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

// Vérifie que le middleware RBAC bloque correctement les accès non autorisés.

let adminToken = '';
let employeToken = '';

beforeAll(async () => {
  const [adminRes, empRes] = await Promise.all([
    request(app).post('/api/auth/login').send({ email: 'admin@pfe.local', password: 'admin123' }),
    request(app).post('/api/auth/login').send({ email: 'employe@pfe.local', password: 'employe1' }),
  ]);
  adminToken  = adminRes.body.token  ?? '';
  employeToken = empRes.body.token ?? '';
});

describe('RBAC — routes protégées par rôle', () => {
  it('Admin peut lister les utilisateurs', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('Employé ne peut pas lister les utilisateurs (403)', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${employeToken}`);
    expect(res.status).toBe(403);
  });

  it('Admin peut créer un département', async () => {
    const res = await request(app)
      .post('/api/hr/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Dept_Test_${Date.now()}` });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('Employé ne peut pas créer un département (403)', async () => {
    const res = await request(app)
      .post('/api/hr/departments')
      .set('Authorization', `Bearer ${employeToken}`)
      .send({ name: 'Dept_Bloqué' });
    expect(res.status).toBe(403);
  });

  it('Route inexistante retourne 404', async () => {
    const res = await request(app).get('/api/route-qui-nexiste-pas');
    expect(res.status).toBe(404);
  });
});
