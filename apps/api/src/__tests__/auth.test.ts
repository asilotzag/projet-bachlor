import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

// Ces tests utilisent les comptes créés par le seed (admin@pfe.local / admin123).
// Ils requièrent une BDD accessible avec les données de seed.

let adminToken = '';

describe('Auth — POST /api/auth/login', () => {
  it('échoue avec des identifiants incorrects (401)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@pfe.local', password: 'mauvais_mdp' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('message');
  });

  it('réussit avec les bons identifiants et retourne un token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@pfe.local', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe('admin@pfe.local');
    expect(res.body.user.role).toBe('ADMIN');
    adminToken = res.body.token;
  });

  it('échoue avec un email manquant (400)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'admin123' });
    expect(res.status).toBe(400);
  });
});

describe('Auth — GET /api/auth/me', () => {
  beforeAll(async () => {
    if (!adminToken) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@pfe.local', password: 'admin123' });
      adminToken = res.body.token;
    }
  });

  it('retourne le profil avec un token valide', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('admin@pfe.local');
  });

  it('retourne 401 sans token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('retourne 401 avec un token invalide', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer token.invalide.ici');
    expect(res.status).toBe(401);
  });
});
