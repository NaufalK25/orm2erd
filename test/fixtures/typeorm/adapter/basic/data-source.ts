import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "./entity/User";
import { Profile } from "./entity/Profile";
import { Post } from "./entity/Post";
import { Tag } from "./entity/Tag";

export const AppDataSource = new DataSource({
  type: "sqljs",
  synchronize: false,
  entities: [User, Profile, Post, Tag],
});
