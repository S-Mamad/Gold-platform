-- Physical gold delivery holds grams until an admin releases or rejects them.
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'DELIVER_GOLD';
