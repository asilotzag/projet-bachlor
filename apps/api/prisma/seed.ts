import 'dotenv/config';
import { PrismaClient, RoleName } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT = 12;
const hash = (p: string) => bcrypt.hash(p, SALT);

async function main() {
  console.log('🌱 Seed démo — début');

  // ─── 1. Rôles ─────────────────────────────────────────────────────────────
  for (const name of Object.values(RoleName)) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  // ─── 2. Utilisateurs ──────────────────────────────────────────────────────
  const users = [
    { email: 'admin@pfe.local',    fullName: 'Administrateur',     role: RoleName.ADMIN,    password: 'admin123' },
    { email: 'rh@pfe.local',       fullName: 'Nadia Benmoussa',    role: RoleName.RH,       password: 'rh123456' },
    { email: 'manager@pfe.local',  fullName: 'Karim El Fassi',     role: RoleName.MANAGER,  password: 'manager1' },
    { email: 'employe@pfe.local',  fullName: 'Asmae Salhi',        role: RoleName.EMPLOYE,  password: 'employe1' },
    { email: 'dev@pfe.local',      fullName: 'Youssef Tazi',       role: RoleName.EMPLOYE,  password: 'employe1' },
    { email: 'design@pfe.local',   fullName: 'Sara Chraibi',       role: RoleName.EMPLOYE,  password: 'employe1' },
    { email: 'finance@pfe.local',  fullName: 'Omar Benali',        role: RoleName.MANAGER,  password: 'manager1' },
  ];

  const userMap: Record<string, string> = {};
  for (const u of users) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: u.role } });
    const rec = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash: await hash(u.password) },
      create: { email: u.email, fullName: u.fullName, passwordHash: await hash(u.password), roleId: role.id },
    });
    userMap[u.email] = rec.id;
    console.log(`  ✓ user  ${u.role.padEnd(8)} ${u.email} / ${u.password}`);
  }

  // ─── 3. Catégories de documents ───────────────────────────────────────────
  const catNames = [
    { name: 'Contrats',      color: '#3B82F6' },
    { name: 'Factures',      color: '#10B981' },
    { name: 'RH',            color: '#F59E0B' },
    { name: 'Technique',     color: '#8B5CF6' },
    { name: 'Commercial',    color: '#EC4899' },
    { name: 'Administratif', color: '#64748B' },
  ];
  const catMap: Record<string, number> = {};
  for (const c of catNames) {
    const rec = await prisma.category.upsert({ where: { name: c.name }, update: {}, create: c });
    catMap[c.name] = rec.id;
  }
  console.log('  ✓ catégories créées');

  // ─── 4. Tags ──────────────────────────────────────────────────────────────
  const tagNames = ['Important', 'Archivé', 'À valider', 'Confidentiel', 'En cours'];
  const tagMap: Record<string, number> = {};
  for (const t of tagNames) {
    const rec = await prisma.tag.upsert({ where: { name: t }, update: {}, create: { name: t } });
    tagMap[t] = rec.id;
  }
  console.log('  ✓ tags créés');

  // ─── 5. Documents de démonstration ────────────────────────────────────────
  const docs = [
    { title: 'Contrat CDI - Asmae Salhi', filename: 'contrat_asmae.pdf', originalName: 'Contrat CDI - Asmae Salhi.pdf', mimeType: 'application/pdf', size: 245000, categoryId: catMap['Contrats'], uploadedById: userMap['rh@pfe.local'] },
    { title: 'Facture Fournisseur Mars 2026', filename: 'facture_mars.pdf', originalName: 'Facture_Mars_2026.pdf', mimeType: 'application/pdf', size: 118000, categoryId: catMap['Factures'], uploadedById: userMap['admin@pfe.local'] },
    { title: 'Cahier des charges ERP v2', filename: 'cdc_erp_v2.pdf', originalName: 'CDC_ERP_v2.pdf', mimeType: 'application/pdf', size: 520000, categoryId: catMap['Technique'], uploadedById: userMap['manager@pfe.local'] },
    { title: 'Fiche de poste Développeur', filename: 'fiche_dev.pdf', originalName: 'Fiche_Poste_Dev.pdf', mimeType: 'application/pdf', size: 89000, categoryId: catMap['RH'], uploadedById: userMap['rh@pfe.local'] },
    { title: 'Rapport CA Trimestriel Q1', filename: 'ca_q1_2026.pdf', originalName: 'CA_Q1_2026.pdf', mimeType: 'application/pdf', size: 340000, categoryId: catMap['Commercial'], uploadedById: userMap['finance@pfe.local'] },
  ];
  for (const d of docs) {
    await prisma.document.upsert({ where: { id: `demo-${d.filename}` }, update: {}, create: { id: `demo-${d.filename}`, ...d } });
  }
  console.log('  ✓ documents créés');

  // ─── 6. Départements ──────────────────────────────────────────────────────
  const deptNames = ['Informatique', 'Ressources Humaines', 'Finance', 'Commercial', 'Direction'];
  const deptMap: Record<string, number> = {};
  for (const name of deptNames) {
    const rec = await prisma.department.upsert({ where: { name }, update: {}, create: { name } });
    deptMap[name] = rec.id;
  }
  console.log('  ✓ départements créés');

  // ─── 7. Profils employés ──────────────────────────────────────────────────
  const employees = [
    { email: 'rh@pfe.local',      position: 'Responsable RH',          dept: 'Ressources Humaines', phone: '+212 661 000 001' },
    { email: 'manager@pfe.local', position: 'Chef de projet IT',        dept: 'Informatique',        phone: '+212 661 000 002' },
    { email: 'employe@pfe.local', position: 'Développeur Full Stack',   dept: 'Informatique',        phone: '+212 661 000 003' },
    { email: 'dev@pfe.local',     position: 'Développeur Backend',      dept: 'Informatique',        phone: '+212 661 000 004' },
    { email: 'design@pfe.local',  position: 'Designer UI/UX',           dept: 'Informatique',        phone: '+212 661 000 005' },
    { email: 'finance@pfe.local', position: 'Responsable Financier',    dept: 'Finance',             phone: '+212 661 000 006' },
  ];
  const empMap: Record<string, string> = {};
  for (const e of employees) {
    const userId = userMap[e.email];
    if (!userId) continue;
    const rec = await prisma.employee.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        position: e.position,
        departmentId: deptMap[e.dept],
        phone: e.phone,
        hireDate: new Date('2024-01-15'),
      },
    });
    empMap[e.email] = rec.id;
  }
  console.log('  ✓ profils employés créés');

  // ─── 8. Contrats ──────────────────────────────────────────────────────────
  for (const empId of Object.values(empMap)) {
    const existing = await prisma.contract.findFirst({ where: { employeeId: empId, isActive: true } });
    if (!existing) {
      await prisma.contract.create({
        data: { employeeId: empId, type: 'CDI', startDate: new Date('2024-01-15'), salary: 12000, isActive: true },
      });
    }
  }
  console.log('  ✓ contrats créés');

  // ─── 9. Projets & tâches ──────────────────────────────────────────────────
  const managerId = userMap['manager@pfe.local'];

  let project = await prisma.project.findFirst({ where: { name: 'Refonte ERP v2' } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'Refonte ERP v2',
        description: 'Migration complète du système ERP vers une architecture microservices.',
        status: 'ACTIVE',
        managerId,
        members: {
          create: [
            { userId: managerId },
            { userId: userMap['employe@pfe.local'] },
            { userId: userMap['dev@pfe.local'] },
            { userId: userMap['design@pfe.local'] },
          ],
        },
      },
    });
  }

  const tasks = [
    { title: 'Analyse des besoins fonctionnels', status: 'DONE',        priority: 'HIGH',   assigneeEmail: 'manager@pfe.local', pos: 0, daysAgo: 10 },
    { title: 'Design de la base de données',     status: 'DONE',        priority: 'HIGH',   assigneeEmail: 'dev@pfe.local',     pos: 1, daysAgo: 7  },
    { title: 'Maquettes UI/UX',                  status: 'DONE',        priority: 'MEDIUM', assigneeEmail: 'design@pfe.local',  pos: 2, daysAgo: 5  },
    { title: 'Développement module Auth',         status: 'IN_PROGRESS', priority: 'HIGH',   assigneeEmail: 'employe@pfe.local', pos: 0, daysAgo: 2  },
    { title: 'Développement module GED',          status: 'IN_PROGRESS', priority: 'HIGH',   assigneeEmail: 'dev@pfe.local',     pos: 1, daysAgo: 1  },
    { title: 'Intégration IA',                   status: 'REVIEW',      priority: 'MEDIUM', assigneeEmail: 'employe@pfe.local', pos: 0, daysAgo: 0  },
    { title: 'Tests unitaires',                  status: 'TODO',        priority: 'MEDIUM', assigneeEmail: 'dev@pfe.local',     pos: 0, daysFromNow: 5  },
    { title: 'Déploiement production',           status: 'TODO',        priority: 'URGENT', assigneeEmail: 'manager@pfe.local', pos: 1, daysFromNow: 14 },
    { title: 'Documentation technique',          status: 'TODO',        priority: 'LOW',    assigneeEmail: 'employe@pfe.local', pos: 2, daysFromNow: 20 },
  ];

  for (const t of tasks) {
    const existing = await prisma.task.findFirst({ where: { projectId: project.id, title: t.title } });
    if (!existing) {
      const dueDate = 'daysFromNow' in t
        ? new Date(Date.now() + (t as any).daysFromNow * 86400000)
        : new Date(Date.now() - (t as any).daysAgo * 86400000);
      await prisma.task.create({
        data: {
          title: t.title,
          status: t.status as any,
          priority: t.priority as any,
          position: t.pos,
          project:   { connect: { id: project.id } },
          createdBy: { connect: { id: managerId } },
          assignee:  userMap[t.assigneeEmail] ? { connect: { id: userMap[t.assigneeEmail] } } : undefined,
          dueDate,
        },
      });
    }
  }
  console.log('  ✓ projet + tâches créés');

  // ─── 10. Demandes de congé ────────────────────────────────────────────────
  const leaveSeeds = [
    { email: 'employe@pfe.local', type: 'CONGE_PAYE',     start: '2026-07-01', end: '2026-07-15', status: 'APPROUVE',   approverEmail: 'rh@pfe.local' },
    { email: 'dev@pfe.local',     type: 'MALADIE',         start: '2026-05-10', end: '2026-05-12', status: 'APPROUVE',   approverEmail: 'rh@pfe.local' },
    { email: 'design@pfe.local',  type: 'CONGE_SANS_SOLDE', start: '2026-08-01', end: '2026-08-07', status: 'EN_ATTENTE', approverEmail: null },
    { email: 'finance@pfe.local', type: 'CONGE_PAYE',     start: '2026-09-01', end: '2026-09-10', status: 'EN_ATTENTE', approverEmail: null },
  ];

  for (const l of leaveSeeds) {
    const empId = empMap[l.email];
    if (!empId) continue;
    const existing = await prisma.leaveRequest.findFirst({ where: { employeeId: empId, startDate: new Date(l.start) } });
    if (!existing) {
      await prisma.leaveRequest.create({
        data: {
          employeeId: empId,
          type: l.type as any,
          startDate: new Date(l.start),
          endDate: new Date(l.end),
          status: l.status as any,
          approvedById: l.approverEmail ? userMap[l.approverEmail] : null,
          approvedAt: l.status === 'APPROUVE' ? new Date() : null,
        },
      });
    }
  }
  console.log('  ✓ congés créés');

  // ─── 11. Présence (7 derniers jours ouvrés) ───────────────────────────────
  const today = new Date();
  for (let d = 6; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    const day = date.getDay();
    if (day === 0 || day === 6) continue; // ignorer week-end

    for (const [email, empId] of Object.entries(empMap)) {
      const checkIn = new Date(date); checkIn.setHours(8, 30, 0, 0);
      const checkOut = new Date(date); checkOut.setHours(17, 30, 0, 0);
      // Sara absente 1 jour, Youssef en retard 1 jour
      let status: 'PRESENT' | 'ABSENT' | 'RETARD' = 'PRESENT';
      if (email === 'design@pfe.local' && d === 2) status = 'ABSENT';
      if (email === 'dev@pfe.local'    && d === 1) status = 'RETARD';

      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: empId, date } },
        create: { employeeId: empId, date, status, checkIn, checkOut },
        update: {},
      });
    }
  }
  console.log('  ✓ présences créées');

  console.log('\n✅ Seed terminé ! Comptes de démonstration :');
  console.log('   admin@pfe.local     / admin123   (ADMIN)');
  console.log('   rh@pfe.local        / rh123456   (RH)');
  console.log('   manager@pfe.local   / manager1   (MANAGER)');
  console.log('   employe@pfe.local   / employe1   (EMPLOYÉ)');
}

main()
  .catch((e) => { console.error('[seed] erreur :', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
