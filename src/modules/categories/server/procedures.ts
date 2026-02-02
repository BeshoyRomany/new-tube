import { db } from "@/db";
import { categories } from "@/db/schema";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";

export const categoriesRouter = createTRPCRouter({
  //Inversion of Control (IoC)
  getMany: baseProcedure.query(async () => {
    // await new Promise((res) => setTimeout(res, 3000));
    const data = await db.select().from(categories);
    return data;
  }),
});
