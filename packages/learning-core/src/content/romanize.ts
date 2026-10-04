// Deterministic display transliteration only; never a pronunciation score or authored replacement.
export function transliterateTelugu(text:string):string {
 const vowels:Record<string,string>={'అ':'a','ఆ':'aa','ఇ':'i','ఈ':'ee','ఉ':'u','ఊ':'oo','ఋ':'ru','ఎ':'e','ఏ':'ee','ఐ':'ai','ఒ':'o','ఓ':'oo','ఔ':'au'};
 const consonants:Record<string,string>={'క':'k','ఖ':'kh','గ':'g','ఘ':'gh','ఙ':'ng','చ':'ch','ఛ':'chh','జ':'j','ఝ':'jh','ఞ':'ny','ట':'t','ఠ':'th','డ':'d','ఢ':'dh','ణ':'n','త':'t','థ':'th','ద':'d','ధ':'dh','న':'n','ప':'p','ఫ':'ph','బ':'b','భ':'bh','మ':'m','య':'y','ర':'r','ఱ':'r','ల':'l','ళ':'l','వ':'v','శ':'sh','ష':'sh','స':'s','హ':'h'};
 const signs:Record<string,string>={'ా':'aa','ి':'i','ీ':'ee','ు':'u','ూ':'oo','ృ':'ru','ె':'e','ే':'ee','ై':'ai','ొ':'o','ో':'oo','ౌ':'au','్':''};
 const chars=[...text];let result='';
 for(let i=0;i<chars.length;i++){const ch=chars[i];if(consonants[ch]){result+=consonants[ch];if(chars[i+1] in signs)result+=signs[chars[++i]];else result+='a';}else result+=vowels[ch]??({'ం':'m','ః':'h','\u200c':'','\u200d':''}[ch]??ch);}
 return result;
}
