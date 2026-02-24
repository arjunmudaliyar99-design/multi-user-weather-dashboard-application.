const mongoose = require('mongoose');

const connectDB = async () => {
  const attempt = async (retries) => {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
      });
      console.log('MongoDB connected successfully');
    } catch (error) {
      console.error(`MongoDB connection error: ${error.message}`);
      if (retries > 0) {
        console.log(`Retrying in 5s… (${retries} attempts left)`);
        setTimeout(() => attempt(retries - 1), 5000);
      } else {
        console.error('MongoDB failed after all retries. Server stays up but DB calls will fail.');
      }
    }
  };
  await attempt(5);
};

module.exports = connectDB;
