export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  issues?: ValidationIssue[];
};