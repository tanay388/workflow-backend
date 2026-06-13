import type { Repository } from 'typeorm';
import type { ComposioService } from '../connections/composio.service';
import type { TriggerSubscription } from './entities/trigger-subscription.entity';

/**
 * Disable the external Composio trigger instance only when no other live
 * subscription row still references it. Composio's upsert dedupes instances
 * per (event slug, connected account), so wait-node bindings and workflow
 * triggers can share one external_id; disabling it while a sibling is live
 * would silently cut that sibling's event feed.
 */
export async function disableInstanceIfUnshared(
  subs: Repository<TriggerSubscription>,
  composio: ComposioService,
  externalId: string,
  excludeRowId: string,
): Promise<boolean> {
  const sharers = await subs
    .createQueryBuilder('s')
    .where('s.external_id = :externalId', { externalId })
    .andWhere('s.id != :excludeRowId', { excludeRowId })
    .andWhere('s.deleted_at IS NULL')
    .andWhere("(s.status IS NULL OR s.status != 'disabled')")
    .getCount();
  if (sharers > 0) return false;
  await composio.disableTriggerInstance(externalId);
  return true;
}
