const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const magazineSize = 17;

  const candidates = [
    path.resolve(__dirname, '../api/config.json'),
    path.resolve(__dirname, '../config.json'),
  ];
  const configPath = candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
  const configRaw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configRaw);
  const partsCfg = config?.parts ?? {};
  const order: string[] = Array.isArray(config?.order)
    ? config.order
    : Object.keys(partsCfg);

  const components = order.map((type) => ({
    type,
    name: partsCfg?.[type]?.displayName ?? type,
    totalStock: 100,
    warningStock: 10,
    magazineCount: 2,
    magazineSize,
    maxOrderQuantity: 2,
  }));

  for (const comp of components) {
    const component = await prisma.component.upsert({
      where: { type: comp.type },
      update: { name: comp.name },
      create: {
        type: comp.type,
        name: comp.name,
      },
    });

    await prisma.inventory.upsert({
      where: { componentId: component.id },
      update: {},
      create: {
        componentId: component.id,
        totalStock: comp.totalStock,
        warningStock: comp.warningStock,
        magazineCount: comp.magazineCount,
        magazineSize: comp.magazineSize,
        currentMagazineStock: comp.magazineSize, // Magazine voll
        estimatedMagazineStock: comp.magazineSize, // Geschätzter Bestand = Magazingröße
        maxOrderQuantity: comp.maxOrderQuantity,
      },
    });

    console.log(
      `Created component: ${comp.name} with totalStock: ${comp.totalStock}, magazineCount: ${comp.magazineCount}, magazineSize: ${comp.magazineSize}`
    );
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  })
  .then(() => process.exit(0));
