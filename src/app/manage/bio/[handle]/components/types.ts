export type BioBlock = {
  id: string;
  type: string;
  position: number;
  title: string | null;
  url: string | null;
  content: string | null;
};

export type BioProfile = {
  id: string;
  handle: string;
  displayName: string | null;
  bioText: string | null;
  avatarUrl: string | null;
  theme: string;
  blocks: BioBlock[];
};

export type ProfileField = 'displayName' | 'bioText' | 'avatarUrl' | 'theme';
