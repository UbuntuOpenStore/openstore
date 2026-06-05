import mongoose from 'mongoose';

export async function waitForMongoose() {
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve) => mongoose.connection.once('open', resolve));
  }
}

export function closeMongoose() {
  return mongoose.connection.close();
}

export async function cleanMongoose() {
  const db = mongoose.connection.db!;
  const collections = await db.listCollections().toArray();
  await Promise.all(
    collections.map(({ name }) => {
      if (name === 'system.profile') {
        return null;
      }

      const collection = db.collection(name);
      return collection.deleteMany({});
    }),
  );
}
