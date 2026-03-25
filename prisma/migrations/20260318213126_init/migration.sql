-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('PART1', 'PART2', 'PART3', 'PART4', 'PART5');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PROCESSING_ORDER', 'ORDER_READY', 'PICKED_UP', 'MAGAZINE_CHANGE_NEEDED', 'ABORTED');

-- CreateTable
CREATE TABLE "Component" (
    "id" TEXT NOT NULL,
    "type" "ComponentType" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "totalStock" INTEGER NOT NULL DEFAULT 0,
    "currentMagazineStock" INTEGER NOT NULL DEFAULT 0,
    "estimatedMagazineStock" INTEGER NOT NULL DEFAULT 0,
    "warningStock" INTEGER NOT NULL DEFAULT 30,
    "magazineCount" INTEGER NOT NULL DEFAULT 2,
    "magazineSize" INTEGER NOT NULL DEFAULT 17,
    "maxOrderQuantity" INTEGER NOT NULL DEFAULT 2,
    "lastRestocked" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "totalItems" INTEGER NOT NULL,
    "dispensedItems" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "magazineChangeNeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "abortedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "showMagazineChangeButton" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Component_type_key" ON "Component"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_componentId_key" ON "Inventory"("componentId");

-- CreateIndex
CREATE INDEX "Inventory_componentId_idx" ON "Inventory"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_componentId_idx" ON "OrderItem"("componentId");

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
