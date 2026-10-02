import { InviteDecision } from "./invite-decision";
export default async function InvitePage({params}:{params:Promise<{token:string}>}) { const {token}=await params; return <InviteDecision token={token}/>; }
