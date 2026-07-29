import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("tbl_customer")
export class CustomerArchive {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "full_name" })
  fullName: string;

  @Column()
  email: string;
}
