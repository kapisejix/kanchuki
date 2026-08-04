-- TeamMember phone-OTP login (2026-08-04, auth bridge Option A).
-- Kanchuki's own field/sales/support agents can now log into the retailer
-- mobile app with the same phone-OTP flow instead of only the email+password
-- /team/login path. The phone is optional — email+password stays the primary
-- credential; agents who want the mobile staff screens get a phone set.

ALTER TABLE "team_members" ADD COLUMN "phone" TEXT;
CREATE UNIQUE INDEX "team_members_phone_key" ON "team_members"("phone");
