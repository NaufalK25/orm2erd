import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from "typeorm";
import { User } from "./User";

@Entity()
export class Profile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  bio?: string;

  @OneToOne(() => User, (user) => user.profile, { onDelete: "SET NULL" })
  @JoinColumn()
  user: User;
}
