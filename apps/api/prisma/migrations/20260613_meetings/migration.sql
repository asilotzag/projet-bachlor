-- ── Meetings ──────────────────────────────────────────────────────────────────

CREATE TABLE "Meeting" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "startAt"     TIMESTAMP(3) NOT NULL,
    "endAt"       TIMESTAMP(3) NOT NULL,
    "location"    TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Meeting_startAt_idx"     ON "Meeting"("startAt");
CREATE INDEX "Meeting_createdById_idx" ON "Meeting"("createdById");

ALTER TABLE "Meeting"
  ADD CONSTRAINT "Meeting_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── MeetingAttendee ───────────────────────────────────────────────────────────

CREATE TABLE "MeetingAttendee" (
    "id"        TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    CONSTRAINT "MeetingAttendee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingAttendee_meetingId_userId_key"
  ON "MeetingAttendee"("meetingId", "userId");

ALTER TABLE "MeetingAttendee"
  ADD CONSTRAINT "MeetingAttendee_meetingId_fkey"
  FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeetingAttendee"
  ADD CONSTRAINT "MeetingAttendee_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
