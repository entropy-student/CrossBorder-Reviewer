"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20260908000300 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20260908000300 extends migrations_1.Migration {
    async up() {
        this.addSql(`alter table if exists "paypal_event_inbox" add column if not exists "created_at" timestamptz not null default now();`);
        this.addSql(`alter table if exists "paypal_event_inbox" add column if not exists "updated_at" timestamptz not null default now();`);
        this.addSql(`alter table if exists "paypal_event_inbox" add column if not exists "deleted_at" timestamptz null;`);
        this.addSql(`alter table if exists "paypal_payment_operation" add column if not exists "created_at" timestamptz not null default now();`);
        this.addSql(`alter table if exists "paypal_payment_operation" add column if not exists "updated_at" timestamptz not null default now();`);
        this.addSql(`alter table if exists "paypal_payment_operation" add column if not exists "deleted_at" timestamptz null;`);
    }
    async down() {
        this.addSql(`alter table if exists "paypal_event_inbox" drop column if exists "deleted_at";`);
        this.addSql(`alter table if exists "paypal_event_inbox" drop column if exists "updated_at";`);
        this.addSql(`alter table if exists "paypal_event_inbox" drop column if exists "created_at";`);
        this.addSql(`alter table if exists "paypal_payment_operation" drop column if exists "deleted_at";`);
        this.addSql(`alter table if exists "paypal_payment_operation" drop column if exists "updated_at";`);
        this.addSql(`alter table if exists "paypal_payment_operation" drop column if exists "created_at";`);
    }
}
exports.Migration20260908000300 = Migration20260908000300;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNjA5MDgwMDAzMDAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9wYXlwYWwtcmVjb25jaWxpYXRpb24vbWlncmF0aW9ucy9NaWdyYXRpb24yMDI2MDkwODAwMDMwMC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx5RUFBb0U7QUFFcEUsTUFBYSx1QkFBd0IsU0FBUSxzQkFBUztJQUNwRCxLQUFLLENBQUMsRUFBRTtRQUNOLElBQUksQ0FBQyxNQUFNLENBQUMsc0hBQXNILENBQUMsQ0FBQTtRQUNuSSxJQUFJLENBQUMsTUFBTSxDQUFDLHNIQUFzSCxDQUFDLENBQUE7UUFDbkksSUFBSSxDQUFDLE1BQU0sQ0FBQyxvR0FBb0csQ0FBQyxDQUFBO1FBQ2pILElBQUksQ0FBQyxNQUFNLENBQUMsNEhBQTRILENBQUMsQ0FBQTtRQUN6SSxJQUFJLENBQUMsTUFBTSxDQUFDLDRIQUE0SCxDQUFDLENBQUE7UUFDekksSUFBSSxDQUFDLE1BQU0sQ0FBQywwR0FBMEcsQ0FBQyxDQUFBO0lBQ3pILENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSTtRQUNSLElBQUksQ0FBQyxNQUFNLENBQUMsZ0ZBQWdGLENBQUMsQ0FBQTtRQUM3RixJQUFJLENBQUMsTUFBTSxDQUFDLGdGQUFnRixDQUFDLENBQUE7UUFDN0YsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnRkFBZ0YsQ0FBQyxDQUFBO1FBQzdGLElBQUksQ0FBQyxNQUFNLENBQUMsc0ZBQXNGLENBQUMsQ0FBQTtRQUNuRyxJQUFJLENBQUMsTUFBTSxDQUFDLHNGQUFzRixDQUFDLENBQUE7UUFDbkcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxzRkFBc0YsQ0FBQyxDQUFBO0lBQ3JHLENBQUM7Q0FDRjtBQWxCRCwwREFrQkMifQ==