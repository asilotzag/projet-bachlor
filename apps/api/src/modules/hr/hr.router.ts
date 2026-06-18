import { Router } from 'express';
import { authGuard, requireRole } from '../../middleware/auth.js';
import {
  // Départements
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  // Employés
  listEmployees, getEmployee, createEmployee, createFullEmployee, updateEmployee,
  // Contrats
  listContracts, createContract, updateContract,
  // Congés
  listLeaves, createLeave, approveLeave, myLeaves,
  // Présence
  listAttendance, upsertAttendance,
  // Organigramme
  getOrgChart,
} from './hr.controller.js';

const router = Router();
router.use(authGuard);

// ─── Départements (Admin/RH) ───────────────────────────────────────────────
router.get('/departments',      listDepartments);
router.post('/departments',     requireRole('ADMIN', 'RH'), createDepartment);
router.put('/departments/:id',  requireRole('ADMIN', 'RH'), updateDepartment);
router.delete('/departments/:id', requireRole('ADMIN'), deleteDepartment);

// ─── Employés ──────────────────────────────────────────────────────────────
router.get('/employees',      listEmployees);
router.get('/employees/:id',  getEmployee);
router.post('/employees',          requireRole('ADMIN', 'RH'), createEmployee);
router.post('/employees/full',     requireRole('ADMIN', 'RH'), createFullEmployee);
router.put('/employees/:id',  requireRole('ADMIN', 'RH'), updateEmployee);

// ─── Contrats ──────────────────────────────────────────────────────────────
router.get('/employees/:id/contracts',  listContracts);
router.post('/employees/:id/contracts', requireRole('ADMIN', 'RH'), createContract);
router.put('/contracts/:id',            requireRole('ADMIN', 'RH'), updateContract);

// ─── Congés ────────────────────────────────────────────────────────────────
router.get('/leaves',        listLeaves);      // Admin/RH : toutes ; autres : les leurs
router.get('/leaves/mine',   myLeaves);
router.post('/leaves',       createLeave);     // tout le monde peut demander
router.put('/leaves/:id',    requireRole('ADMIN', 'RH'), approveLeave); // approuver/refuser

// ─── Présence ──────────────────────────────────────────────────────────────
router.get('/attendance',    listAttendance);                          // scoped per role in controller
router.post('/attendance',   requireRole('ADMIN', 'RH'), upsertAttendance);

// ─── Organigramme ──────────────────────────────────────────────────────────
router.get('/orgchart',      requireRole('ADMIN', 'RH', 'MANAGER'), getOrgChart);

export default router;
