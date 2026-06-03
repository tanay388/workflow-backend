import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListApprovalsQueryDto {
  @IsOptional()
  @IsEnum(['pending', 'approved', 'rejected', 'expired'])
  status?: 'pending' | 'approved' | 'rejected' | 'expired';
}

export class ApprovalDecisionDto {
  @IsEnum(['approve', 'reject'])
  decision!: 'approve' | 'reject';
}

export class PublicApprovalDecisionDto {
  @IsEnum(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  comment?: string;
}
