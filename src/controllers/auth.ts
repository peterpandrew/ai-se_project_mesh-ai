import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import User from '../models/user.js';

const invalidCredentialsMessage = 'Invalid email or password';

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 11000;

export const getCurrentUser = (req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    data: {
      userId: 'user_001',
      email: 'user@example.com',
      name: 'John Doe',
      createdAt: '2026-01-01T00:00:00Z',
    },
    error: null,
  });
};

export const registerUser = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { email, password, name } = req.body ?? {};

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    typeof name !== 'string' ||
    !email.trim() ||
    !password ||
    !name.trim()
  ) {
    res.status(400).json({
      success: false,
      data: null,
      error: { message: 'Email, password, and name are required' },
    });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({
      success: false,
      data: null,
      error: { message: 'Password must be at least 8 characters' },
    });
    return;
  }

  if (await User.findOne({ email })) {
    res.status(409).json({
      success: false,
      data: null,
      error: { message: 'A user with this email already exists' },
    });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ email, password: hashedPassword, name });

  try {
    await user.save();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      res.status(409).json({
        success: false,
        data: null,
        error: { message: 'A user with this email already exists' },
      });
      return;
    }

    throw error;
  }

  res.status(201).json({
    success: true,
    data: {
      userId: user._id,
      email: user.email,
      name: user.name,
    },
    error: null,
  });
};

export const loginUser = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { email, password } = req.body ?? {};

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !email.trim() ||
    !password
  ) {
    res.status(400).json({
      success: false,
      data: null,
      error: { message: 'Email and password are required' },
    });
    return;
  }

  const user = await User.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({
      success: false,
      data: null,
      error: { message: invalidCredentialsMessage },
    });
    return;
  }

  const token = jwt.sign(
    { userId: user._id.toString() },
    process.env.JWT_SECRET!,
  );

  res.status(200).json({
    success: true,
    data: {
      token,
      user: {
        userId: user._id,
        email: user.email,
        name: user.name,
      },
    },
    error: null,
  });
};
