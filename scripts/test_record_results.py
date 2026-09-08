import copy
import json
import unittest
from record_results import ROOT, summarize

class ReportTests(unittest.TestCase):
    def setUp(self):
        self.run=json.loads((ROOT/'evidence/scene-equivalence-camera.json').read_text())
        self.review=json.loads((ROOT/'evidence/scene-equivalence-summary.json').read_text())
    def test_unreviewed_does_not_claim_black_or_hardware(self):
        run=copy.deepcopy(self.run);run.pop('browser',None)
        result=summarize(run)
        self.assertEqual(result['visualStatus'],'not reviewed')
        self.assertIsNone(result['visualFinding']);self.assertIsNone(result['browserEvidence'])
    def test_matching_review(self):
        result=summarize(self.run,self.review)
        self.assertEqual(result['visualStatus'],'reviewed');self.assertEqual(len(result['reviewedImages']),3)
    def test_wrong_run_and_hash_rejected(self):
        for field in ['cameraRun','executableSha256']:
            review=copy.deepcopy(self.review);review[field]='wrong'
            with self.assertRaises(ValueError):summarize(self.run,review)
    def test_absent_capture_and_bad_image_hash_rejected(self):
        run=copy.deepcopy(self.run);run['frameCaptures']=[]
        with self.assertRaises(ValueError):summarize(run,self.review)
        review=copy.deepcopy(self.review);review['images'][0]['sha256']='wrong'
        with self.assertRaises(ValueError):summarize(self.run,review)

if __name__=='__main__':unittest.main()
