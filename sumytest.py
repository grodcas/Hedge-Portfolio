from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.text_rank import TextRankSummarizer
import nltk
nltk.download('punkt')
nltk.download('punkt_tab')


def textrank_extract(text: str, n_sentences: int = 3) -> list[str]:
    """
    Extract top N most central sentences from the text (TextRank).
    Returns a list of strings (sentences).
    """
    parser = PlaintextParser.from_string(text, Tokenizer("english"))
    summarizer = TextRankSummarizer()

    extracted = summarizer(parser.document, n_sentences)
    return [str(s) for s in extracted]

str = "The Company experienced a variety of market conditions during the quarter, many of which continued trends observed in previous reporting periods.Although overall customer demand remained relatively stable, certain segments showed signs of extended purchasing cycles due to macroeconomic uncertainty.Management believes that these conditions may persist for several quarters, although the exact duration is difficult to predict. As part of its ongoing strategic review, the Company continued to evaluate opportunities to streamline operations and reduce complexity in its global supply chain.During the quarter, the Company recorded net sales of $14.8 billion, representing a 5% increase from the prior-year period.This increase was primarily driven by stronger-than-expected results in the cloud services division, which benefited from several large enterprise renewals.The Company also observed modest growth in its professional hardware segment, though this growth was partially offset by declines in consumer electronics.Gross margin improved to 41.2%, up from 39.8% last year, largely due to favorable product mix and lower freight costs.However, management cautions that certain cost pressures, including elevated component pricing, may continue to influence results in future periods.Research and development expenses increased 11%, reflecting the Company’s continued investment in AI-driven software tools and network optimization technologies. Selling, general and administrative expenses also rose, partly due to higher personnel-related costs and expanded marketing initiatives.The Company recorded a non-cash impairment charge of $73 million related to legacy software assets acquired in 2019.Interest expense decreased modestly as a result of scheduled repayments under the Company’s long-term debt facilities.In addition, the Company recognized a $26 million foreign currency loss, primarily driven by fluctuations in the euro and yen relative to the U.S. dollar.Net income for the quarter totaled $1.24 billion, compared to $1.17 billion in the same period last year.The Company generated operating cash flow of $2.6 billion, although the majority of this amount was reinvested into capacity expansion and data center infrastructure.Management continues to believe that its capital allocation strategy, including targeted share repurchases and disciplined investment, supports long-term shareholder value creation.While the Company remains confident in its competitive positioning, it acknowledges that geopolitical instability and regulatory developments could create additional volatility.The Company does not undertake any obligation to update forward-looking statements, except as required by law.Overall, management is encouraged by the quarter’s results but remains cautious given the evolving macroeconomic environment."

print(textrank_extract(str,5))