import {ExtensionType,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';

// This qualified subset permits exactly one zero-length ImmutableOwner TLV.
export function qualifiedPumpTokenAccountExtensions(tlv,program){
 return tlv.length===0||program.equals(TOKEN_2022_PROGRAM_ID)&&tlv.length===4&&tlv.readUInt16LE(0)===ExtensionType.ImmutableOwner&&tlv.readUInt16LE(2)===0;
}
