import { ComingSoon } from '@/components/coming-soon';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';

export default function CirclesScreen() {
  return (
    <Screen>
      <Section
        title="Your circles"
        footer="Circles are private and invite-only. Members only see the progress you choose to share.">
        <ListRow
          icon={{ ios: 'person.3', android: 'groups', web: 'groups' }}
          title="Create a circle"
          subtitle="Invite friends or family with a link"
        />
        <ListRow
          icon={{ ios: 'qrcode', android: 'qr_code', web: 'qr_code' }}
          title="Join with a code"
        />
      </Section>

      <ComingSoon phase={5} description="Private accountability circles need an account, so they arrive after sign-in." />
    </Screen>
  );
}
