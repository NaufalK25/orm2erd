import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  reference: string;

  @Column({ nullable: true })
  notes?: string;
}
