/**
 * One-time cleanup script: ensures every User has exactly one linked Employee record.
 * Run with: npx tsx apps/api/scripts/fix-employee-links.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Audit des liens User ↔ Employee\n');

  // ── 1. Users without an Employee record ──────────────────────────────────────
  const allUsers = await prisma.user.findMany({
    include: { employee: true, role: true },
  });

  const withoutEmployee = allUsers.filter((u) => !u.employee);
  console.log(`Users sans profil employé : ${withoutEmployee.length}`);
  for (const u of withoutEmployee) {
    await prisma.employee.create({
      data: {
        userId: u.id,
        position: 'À définir',
        hireDate: u.createdAt,
      },
    });
    console.log(`  ✅ Créé Employee pour ${u.email} (${u.role.name})`);
  }

  // ── 2. Duplicate Employee records pointing to the same userId ────────────────
  // (the @unique constraint on Employee.userId prevents this at DB level,
  //  but we check anyway in case of legacy data before the constraint was added)
  const grouped = await prisma.$queryRaw<{ userId: string; count: bigint }[]>`
    SELECT "userId", COUNT(*) as count
    FROM "Employee"
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  `;

  console.log(`\nDoublons Employee détectés : ${grouped.length}`);
  for (const row of grouped) {
    const dupes = await prisma.employee.findMany({
      where: { userId: row.userId },
      orderBy: { createdAt: 'asc' },
    });
    // Keep the first (oldest), delete the rest
    const [keep, ...remove] = dupes;
    for (const d of remove) {
      await prisma.employee.delete({ where: { id: d.id } });
      console.log(`  🗑️  Supprimé Employee dupliqué ${d.id} (userId=${row.userId})`);
    }
    console.log(`  ✅ Conservé Employee ${keep.id} pour userId=${row.userId}`);
  }

  // ── 3. Summary ───────────────────────────────────────────────────────────────
  const total = await prisma.employee.count();
  const totalUsers = await prisma.user.count();
  console.log(`\n✅ Terminé — ${total} profils employé pour ${totalUsers} utilisateurs`);
}

main()
  .catch((e) => { console.error('❌ Erreur :', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
