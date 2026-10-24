import { z } from 'zod';

const phone = z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,17}$/, 'Enter a valid phone number (digits, spaces, +, -, ()).');
const name = z.string().trim().min(2, 'Enter at least 2 characters.').max(60, 'Keep it under 60 characters.');
const email = z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.').max(120);

export const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required.'), remember: z.boolean().optional() });
export const forgotSchema = z.object({ email });
export const registerSchema = z.object({
  name, email, phone,
  password: z.string().min(8, 'Use at least 8 characters.').max(64).regex(/[A-Za-z]/, 'Include a letter.').regex(/[0-9]/, 'Include a number.'),
  confirmPassword: z.string().min(1, 'Confirm your password.'),
  role: z.enum(['patient', 'driver']),
  terms: z.literal(true, { errorMap: () => ({ message: 'You must accept the demo terms.' }) }),
}).refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' });

export const bookingSchema = z.object({
  contactName: name,
  contactPhone: phone,
  pickupLabel: z.string().trim().min(3, 'Enter a pickup address or landmark.').max(120),
  hospitalIndex: z.coerce.number().int().min(0, 'Select a destination.'),
  emergencyType: z.enum(['cardiac', 'accident', 'breathing', 'stroke', 'pregnancy', 'transfer', 'other']),
  condition: z.string().trim().min(5, 'Describe the patient condition (at least 5 characters).').max(300),
  ambulanceType: z.enum(['basic', 'advanced', 'icu']),
  additionalNotes: z.string().trim().max(300).optional(),
});

export const patientProfileSchema = z.object({
  name, phone,
  address: z.string().trim().max(160, 'Keep it under 160 characters.'),
  emergencyContactName: z.string().trim().max(60),
  emergencyContactPhone: z.union([phone, z.literal('')]),
});
export const contactSchema = z.object({ name, phone });
export const userEditSchema = z.object({ name, phone, status: z.enum(['active', 'inactive']) });

export const ambulanceSchema = z.object({
  registration: z.string().trim().min(4, 'Registration must be at least 4 characters.').max(24).regex(/^[A-Za-z0-9 -]+$/, 'Use letters, numbers, spaces and hyphens only.'),
  type: z.enum(['basic', 'advanced', 'icu']),
  operationalStatus: z.enum(['in_service', 'maintenance', 'out_of_service']),
  availability: z.enum(['available', 'offline']),
  driverId: z.string(),
  locationIndex: z.coerce.number().int().min(0),
  routeProfileKey: z.string().min(1),
});

export const settingsSchema = z.object({
  organisationName: z.string().trim().min(2, 'Enter at least 2 characters.').max(60),
  defaultPageSize: z.coerce.number().refine((n) => [5, 10, 20].includes(n), 'Choose 5, 10 or 20.'),
  compactTables: z.boolean(),
});
