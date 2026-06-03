import { Column, Entity, PrimaryColumn } from 'typeorm';

export type IntegrationCatalogStatus = 'ga' | 'beta';

@Entity('integration_catalog')
export class IntegrationCatalog {
  @PrimaryColumn({ type: 'text' })
  slug: string;

  @Column({ type: 'varchar', length: 128 })
  label: string;

  @Column({ type: 'text', name: 'logo_url' })
  logoUrl: string;

  @Column({ type: 'boolean', name: 'supports_triggers', default: false })
  supportsTriggers: boolean;

  @Column({ type: 'varchar', length: 64, default: 'integration' })
  category: string;

  @Column({ type: 'varchar', length: 16, default: 'beta' })
  status: IntegrationCatalogStatus;
}
