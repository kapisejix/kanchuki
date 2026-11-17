'use client';

import DesignLibrary from './DesignLibrary';

// The old retailer AI-template monitor was retired with the `social_templates` feature (D1);
// the URL stays so existing bookmarks and the sidebar link keep working.
export default function SocialTemplatesPage() {
  return (
    <div className="p-6">
      <DesignLibrary />
    </div>
  );
}
