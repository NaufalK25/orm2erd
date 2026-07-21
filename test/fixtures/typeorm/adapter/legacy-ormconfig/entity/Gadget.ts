import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class Gadget {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  serial: string;

  @Column({ nullable: true })
  notes?: string;
}
