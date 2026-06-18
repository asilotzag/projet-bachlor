-- Phase 5 : Module Ressources Humaines

CREATE TYPE "ContractType"      AS ENUM ('CDI','CDD','STAGE','FREELANCE','APPRENTISSAGE');
CREATE TYPE "LeaveType"         AS ENUM ('CONGE_PAYE','CONGE_SANS_SOLDE','MALADIE','MATERNITE','PATERNITE','AUTRE');
CREATE TYPE "LeaveStatus"       AS ENUM ('EN_ATTENTE','APPROUVE','REFUSE');
CREATE TYPE "AttendanceStatus"  AS ENUM ('PRESENT','ABSENT','RETARD','DEMI_JOURNEE');

CREATE TABLE "Department" (
    "id"        SERIAL NOT NULL,
    "name"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

CREATE TABLE "Employee" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "departmentId" INTEGER,
    "position"     TEXT NOT NULL,
    "phone"        TEXT,
    "address"      TEXT,
    "birthDate"    TIMESTAMP(3),
    "hireDate"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Contract" (
    "id"         SERIAL NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type"       "ContractType" NOT NULL,
    "startDate"  TIMESTAMP(3) NOT NULL,
    "endDate"    TIMESTAMP(3),
    "salary"     DOUBLE PRECISION,
    "notes"      TEXT,
    "isActive"   BOOLEAN NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Contract_employeeId_idx" ON "Contract"("employeeId");
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LeaveRequest" (
    "id"           SERIAL NOT NULL,
    "employeeId"   TEXT NOT NULL,
    "type"         "LeaveType" NOT NULL,
    "startDate"    TIMESTAMP(3) NOT NULL,
    "endDate"      TIMESTAMP(3) NOT NULL,
    "reason"       TEXT,
    "status"       "LeaveStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "approvedById" TEXT,
    "approvedAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LeaveRequest_employeeId_idx" ON "LeaveRequest"("employeeId");
CREATE INDEX "LeaveRequest_status_idx"     ON "LeaveRequest"("status");
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Attendance" (
    "id"         SERIAL NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date"       DATE NOT NULL,
    "checkIn"    TIMESTAMP(3),
    "checkOut"   TIMESTAMP(3),
    "status"     "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "notes"      TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Attendance_employeeId_date_key" ON "Attendance"("employeeId","date");
CREATE INDEX "Attendance_employeeId_idx" ON "Attendance"("employeeId");
CREATE INDEX "Attendance_date_idx"       ON "Attendance"("date");
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
