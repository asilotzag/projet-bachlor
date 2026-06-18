-- Add managerId to Employee for manager-employee relationship
ALTER TABLE "Employee" ADD COLUMN "managerId" TEXT;

-- Add foreign key constraint
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index for performance
CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");

-- Add assignee tracking fields to Task
ALTER TABLE "Task" ADD COLUMN "assigneeNotes" TEXT;
ALTER TABLE "Task" ADD COLUMN "assigneeStatus" TEXT DEFAULT 'NOT_STARTED';
