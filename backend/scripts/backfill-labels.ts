import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.profile.findMany({
    where: { OR: [{ label: 'Untitled resume' }, { label: '' }] },
  });
  for (const r of rows) {
    const label = `${r.name} · ${r.createdAt.toISOString().slice(0, 10)}`;
    await prisma.profile.update({ where: { id: r.id }, data: { label } });
    console.log(`${r.id} -> ${label}`);
  }
}

main()
  .finally(() => prisma.$disconnect());
