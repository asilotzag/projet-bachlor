import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

let rhToken = '';
let adminToken = '';

beforeAll(async () => {
  const [rhRes, adminRes] = await Promise.all([
    request(app).post('/api/auth/login').send({ email: 'rh@pfe.local', password: 'rh123456' }),
    request(app).post('/api/auth/login').send({ email: 'admin@pfe.local', password: 'admin123' }),
  ]);
  rhToken    = rhRes.body.token   ?? '';
  adminToken = adminRes.body.token ?? '';
});

describe('RH — Départements', () => {
  let deptId: number;

  it('RH peut créer un département', async () => {
    const name = `Test_Dept_${Date.now()}`;
    const res = await request(app)
      .post('/api/hr/departments')
      .set('Authorization', `Bearer ${rhToken}`)
      .send({ name });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
    deptId = res.body.id;
  });

  it('liste les départements', async () => {
    const res = await request(app)
      .get('/api/hr/departments')
      .set('Authorization', `Bearer ${rhToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('RH peut renommer un département', async () => {
    const newName = `Renommé_${Date.now()}`;
    const res = await request(app)
      .put(`/api/hr/departments/${deptId}`)
      .set('Authorization', `Bearer ${rhToken}`)
      .send({ name: newName });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(newName);
  });
});

describe('RH — Congés', () => {
  it("Utilisateur sans profil employé reçoit 400 à la création d'un congé", async () => {
    // admin@pfe.local n'a pas de profil employé
    const res = await request(app)
      .post('/api/hr/leaves')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'CONGE_PAYE',
        startDate: new Date('2026-08-01').toISOString(),
        endDate: new Date('2026-08-10').toISOString(),
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('profil employé');
  });

  it('dates invalides retournent 400 (fin avant début)', async () => {
    const res = await request(app)
      .post('/api/hr/leaves')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'CONGE_PAYE',
        startDate: new Date('2026-08-10').toISOString(),
        endDate: new Date('2026-08-01').toISOString(),
      });
    expect(res.status).toBe(400);
  });

  it('liste les congés (RH voit tous)', async () => {
    const res = await request(app)
      .get('/api/hr/leaves')
      .set('Authorization', `Bearer ${rhToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
