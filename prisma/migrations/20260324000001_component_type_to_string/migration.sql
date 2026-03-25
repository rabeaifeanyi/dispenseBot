-- AlterTable: Convert Component.type from ComponentType enum to plain TEXT
ALTER TABLE "Component" ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;

-- DropEnum
DROP TYPE "ComponentType";
